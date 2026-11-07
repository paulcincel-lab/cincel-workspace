/**
 * Gmail sync (redesign BE §8.6): first run lists the last 100 inbox threads,
 * later runs use `history.list` from `history_id` (404 → full list); upserts
 * the cache, suggests projects, trims to 500 rows. No notifications.
 *
 * Every read and write is scoped to `staffId` (the session or the cron job's
 * account row), so one person's mail never reaches another's cache.
 */
import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";

import { gmailAccounts, gmailThreads, projects } from "@/lib/db/schema";
import { findGmailAccountState } from "@/lib/gmail/accounts";
import {
  GMAIL_LIST_PAGE_SIZE,
  GmailError,
  gmailClient,
  isGmailError,
  type GmailApi,
  type GmailHeader,
  type GmailHistoryList,
  type GmailThreadList,
  type GmailThreadResource,
} from "@/lib/gmail/client";
import { suggestProjectId } from "@/lib/gmail/suggest";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

/** Threads read by a first (or fallback) sync. */
export const GMAIL_FIRST_SYNC_THREADS = 100;
/** Cached threads kept per staff (BE §3.7). */
export const GMAIL_CACHE_LIMIT = 500;
/** More changed threads than this in one history window → full list instead. */
export const GMAIL_HISTORY_THREAD_CAP = 200;

const INBOX = "INBOX";
const UNREAD = "UNREAD";

export type SyncGmailDeps = {
  /** The Gmail client; defaults to `gmailClient(staffId)`. */
  api?: GmailApi;
  now?: () => Date;
};

// ── Parsing ──────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Gmail snippets come HTML-escaped. */
export function decodeSnippet(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** `"Ana Pérez" <ana@x.mx>` → name + email; a bare address has an empty name. */
export function parseFromHeader(value: string): { name: string; email: string } {
  const trimmed = value.trim();
  const angle = /^(.*)<([^<>]+)>\s*$/.exec(trimmed);
  if (angle) {
    const name = angle[1].trim().replace(/^"(.*)"$/, "$1").trim();
    return { name, email: angle[2].trim().toLowerCase() };
  }
  if (/^[^\s@]+@[^\s@]+$/.test(trimmed)) return { name: "", email: trimmed.toLowerCase() };
  return { name: trimmed, email: "" };
}

function header(headers: GmailHeader[] | undefined, name: string): string | null {
  const found = headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : null;
}

export type ParsedThread = {
  id: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  snippet: string;
  receivedAt: Date;
  unread: boolean;
  labels: string[];
};

/**
 * A `threads.get` (metadata) resource as a cache row: subject of the first
 * message, sender and snippet of the latest one, `receivedAt` = latest
 * `internalDate`, unread when any message is, labels = union. Null for a
 * thread without messages.
 */
export function parseThread(thread: GmailThreadResource): ParsedThread | null {
  const messages = [...(thread.messages ?? [])].sort(
    (a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0),
  );
  if (messages.length === 0) return null;
  const first = messages[0];
  const last = messages[messages.length - 1];
  const labels = [...new Set(messages.flatMap((m) => m.labelIds ?? []))];
  const from = parseFromHeader(header(last.payload?.headers, "From") ?? "");
  const internal = Number(last.internalDate ?? NaN);
  const dateHeader = Date.parse(header(last.payload?.headers, "Date") ?? "");
  const receivedAt = new Date(Number.isFinite(internal) ? internal : Number.isFinite(dateHeader) ? dateHeader : 0);
  return {
    id: thread.id,
    subject: (header(first.payload?.headers, "Subject") ?? "").trim(),
    fromName: from.name,
    fromEmail: from.email,
    snippet: decodeSnippet(last.snippet ?? thread.snippet ?? "").trim(),
    receivedAt,
    unread: messages.some((m) => m.labelIds?.includes(UNREAD)),
    labels,
  };
}

// ── Plans ────────────────────────────────────────────────────────────────────

type SyncPlan = { threadIds: string[]; historyId: string | null; full: boolean };

function maxHistoryId(ids: (string | undefined)[]): string | null {
  let best: bigint | null = null;
  for (const id of ids) {
    if (!id || !/^\d+$/.test(id)) continue;
    const value = BigInt(id);
    if (best === null || value > best) best = value;
  }
  return best === null ? null : best.toString();
}

/** The last 100 threads of `in:inbox` (two pages of 50). */
async function fullPlan(api: GmailApi): Promise<SyncPlan> {
  const threads: { id: string; historyId?: string }[] = [];
  let pageToken: string | undefined;
  do {
    const page = (await api.listThreads({
      q: "in:inbox",
      maxResults: Math.min(GMAIL_LIST_PAGE_SIZE, GMAIL_FIRST_SYNC_THREADS - threads.length),
      pageToken,
    })) as GmailThreadList | undefined;
    threads.push(...(page?.threads ?? []));
    pageToken = page?.nextPageToken;
  } while (pageToken && threads.length < GMAIL_FIRST_SYNC_THREADS);
  const kept = threads.slice(0, GMAIL_FIRST_SYNC_THREADS);
  return { threadIds: [...new Set(kept.map((t) => t.id))], historyId: maxHistoryId(kept.map((t) => t.historyId)), full: true };
}

/** Threads touched since `startHistoryId`; throws `NOT_FOUND` when the history is gone or too long. */
async function historyPlan(api: GmailApi, startHistoryId: string): Promise<SyncPlan> {
  const result = (await api.listHistory(startHistoryId)) as GmailHistoryList | undefined;
  const ids = new Set<string>();
  for (const record of result?.history ?? []) {
    for (const m of record.messages ?? []) ids.add(m.threadId);
    for (const { message } of record.messagesAdded ?? []) ids.add(message.threadId);
    for (const { message } of record.labelsAdded ?? []) ids.add(message.threadId);
    for (const { message } of record.labelsRemoved ?? []) ids.add(message.threadId);
  }
  if (ids.size > GMAIL_HISTORY_THREAD_CAP) throw new GmailError("NOT_FOUND");
  return { threadIds: [...ids], historyId: result?.historyId ?? startHistoryId, full: false };
}

// ── Suggestion input ─────────────────────────────────────────────────────────

/**
 * Active projects visible to the staff member. Every live project is visible
 * to every staff member in Cincel (the project list and detail only hide
 * client data from non-admins), so this is every live `activo` project.
 */
async function suggestionProjects(db: OwnerDb): Promise<{ id: string; name: string; updatedAt: string }[]> {
  const rows = await db
    .select({ id: projects.id, name: projects.name, updatedAt: projects.updatedAt })
    .from(projects)
    .where(and(isNull(projects.deletedAt), eq(projects.status, "activo")));
  return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt.toISOString() }));
}

// ── Sync ─────────────────────────────────────────────────────────────────────

/**
 * Syncs the staff member's inbox into `gmail_threads`. Throws
 * `NOT_CONNECTED` (no row, disconnected, no token), `SCOPE_MISSING` or
 * `RATE_LIMITED` (the client has then set the backoff).
 */
export async function syncGmail(db: OwnerDb, staffId: string, deps: SyncGmailDeps = {}): Promise<{ synced: number }> {
  const now = deps.now?.() ?? new Date();
  const account = await findGmailAccountState(db, staffId);
  if (!account || account.disconnectedAt) throw new GmailError("NOT_CONNECTED");
  const api = deps.api ?? (await gmailClient(staffId, { db }));

  let plan: SyncPlan;
  if (account.historyId) {
    try {
      plan = await historyPlan(api, account.historyId);
    } catch (error) {
      // History too old (404) → full list.
      if (!isGmailError(error, "NOT_FOUND")) throw error;
      plan = await fullPlan(api);
    }
  } else {
    plan = await fullPlan(api);
  }

  const candidates = await suggestionProjects(db);
  const gone: string[] = [];
  let synced = 0;
  const historyIds: (string | undefined)[] = [plan.historyId ?? undefined];

  for (const threadId of plan.threadIds) {
    let resource: GmailThreadResource;
    try {
      resource = (await api.getThread(threadId, "metadata")) as GmailThreadResource;
    } catch (error) {
      if (isGmailError(error, "NOT_FOUND")) {
        gone.push(threadId);
        continue;
      }
      throw error;
    }
    const parsed = parseThread(resource);
    if (!parsed) {
      gone.push(threadId);
      continue;
    }
    historyIds.push(resource.historyId);
    const suggestedProjectId = suggestProjectId({ subject: parsed.subject, snippet: parsed.snippet }, candidates);
    const values = {
      subject: parsed.subject,
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
      snippet: parsed.snippet,
      receivedAt: parsed.receivedAt,
      unread: parsed.unread,
      labels: parsed.labels,
      suggestedProjectId,
    };

    if (!parsed.labels.includes(INBOX)) {
      // Left the inbox (archived, trashed): drop it, unless it is linked to a project.
      await db
        .update(gmailThreads)
        .set(values)
        .where(and(eq(gmailThreads.staffId, staffId), eq(gmailThreads.id, threadId), isNotNull(gmailThreads.projectId)));
      gone.push(threadId);
      continue;
    }

    await db
      .insert(gmailThreads)
      .values({ id: threadId, staffId, ...values })
      .onConflictDoUpdate({ target: [gmailThreads.staffId, gmailThreads.id], set: values });
    synced++;
  }

  if (gone.length > 0) {
    await db
      .delete(gmailThreads)
      .where(and(eq(gmailThreads.staffId, staffId), inArray(gmailThreads.id, gone), isNull(gmailThreads.projectId)));
  }

  await trimGmailThreads(db, staffId);

  // A full list only knows the history ids of what it read; keep the newest seen.
  const historyId = plan.full ? maxHistoryId(historyIds) : plan.historyId;
  const updated = await db
    .update(gmailAccounts)
    .set({ historyId: historyId ?? null, lastSyncedAt: now, lastError: null, nextSyncAfter: null })
    .where(and(eq(gmailAccounts.staffId, staffId), isNull(gmailAccounts.disconnectedAt)))
    .returning({ staffId: gmailAccounts.staffId });
  if (updated.length === 0) {
    // Disconnected while syncing: the cache must stay empty (review B15).
    await db.delete(gmailThreads).where(eq(gmailThreads.staffId, staffId));
    throw new GmailError("NOT_CONNECTED");
  }
  return { synced };
}

/** Keeps the newest `GMAIL_CACHE_LIMIT` threads of one staff member. */
export async function trimGmailThreads(db: OwnerDb, staffId: string, limit = GMAIL_CACHE_LIMIT): Promise<void> {
  const keep = db
    .select({ id: gmailThreads.id })
    .from(gmailThreads)
    .where(eq(gmailThreads.staffId, staffId))
    .orderBy(desc(gmailThreads.receivedAt), desc(gmailThreads.id))
    .limit(limit);
  await db.delete(gmailThreads).where(and(eq(gmailThreads.staffId, staffId), notInArray(gmailThreads.id, keep)));
}

// ── Logging and background runs ──────────────────────────────────────────────

/** The `gmail.sync_failed` JSON log line (BE §14). */
export function logGmailSyncFailed(traceId: string, staffId: string, error: unknown): void {
  console.error(
    JSON.stringify({
      msg: "gmail.sync_failed",
      trace_id: traceId,
      staff_id: staffId,
      code: isGmailError(error) ? error.code : null,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

/** The first sync after consent, run from `after()` in the OAuth callback. Never throws. */
export async function syncGmailInBackground(db: OwnerDb, staffId: string, traceId: string = randomUUID()): Promise<void> {
  try {
    await syncGmail(db, staffId);
  } catch (error) {
    logGmailSyncFailed(traceId, staffId, error);
  }
}
