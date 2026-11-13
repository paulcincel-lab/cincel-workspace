"use server";

import { and, asc, eq, isNull } from "drizzle-orm";

import { toActionResult } from "@/lib/actions/action-result";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveActivitiesCapabilities, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { historyEvents, projects, workflows } from "@/lib/db/schema";
import { assertGmailAccess, loadGmailAccess } from "@/lib/gmail/access";
import { gmailClient, sendDraft } from "@/lib/gmail/client";
import { buildRawEmail } from "@/lib/gmail/compose";
import { confirmTokenSecret, issueConfirmToken, verifyConfirmToken } from "@/lib/gmail/confirm-token";
import { sanitizeEmailHtml } from "@/lib/gmail/sanitize";
import { syncGmail } from "@/lib/gmail/sync";
import { formatAddress, parseGmailThread, type ParsedGmailThread } from "@/lib/gmail/thread-view";
import { gmailStatusOf, listGmailThreadsPage, toThreadSummary, type GmailThreadsPage } from "@/lib/gmail/threads-page";
import * as gmailRepository from "@/lib/repositories/gmail-repository";
import type { GmailThreadRow } from "@/lib/repositories/gmail-repository";
import { createUserTask } from "@/lib/repositories/tasks-repository";
import type {
  GmailDraft,
  GmailMessage,
  GmailStatus,
  GmailThreadSummary,
} from "@/lib/types/redesign";
import type { GmailThreadView } from "@/lib/types/mi-espacio";
import type { ActionResult } from "@/lib/types/schedule";
import { GmailDraftInputSchema, GmailTaskInputSchema, parseInput } from "@/lib/validation/redesign";

/**
 * Gmail read + draft (redesign BE §7.6). Owner-only: every call works on the
 * caller's own mailbox (their own Google token, `users/me`) and the caller's
 * own `gmail_threads` rows; nobody else's Gmail data is ever returned,
 * including to administrators (BE §9.8).
 *
 * Mi espacio reads the mailbox through TanStack Query (`me.gmail.*`) and its
 * mutations update that cache, so nothing here revalidates `/mi-espacio`.
 * Reads have no side effects: opening a thread is `fetchGmailThreadAction`
 * (read-only) plus `markGmailThreadReadAction`.
 */

/** Minimum gap between two manual syncs. */
const SYNC_MIN_INTERVAL_MS = 30 * 1000;
const NO_SUBJECT = "(sin asunto)";

function requireThreadId(id: unknown): string {
  if (typeof id !== "string" || !id.trim() || id.length > 200) throw new Error("NOT_FOUND");
  return id;
}

/** Visible project of the caller: FORBIDDEN without project access, NOT_FOUND when missing or deleted. */
async function loadVisibleProject(
  user: AuthenticatedUser,
  projectId: string,
): Promise<{ id: string; currentWorkflowId: string | null }> {
  if (!resolveProjectsCapabilities(user).canViewProjects) throw new Error("FORBIDDEN");
  const [project] = await db
    .select({ id: projects.id, currentWorkflowId: projects.currentWorkflowId })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) throw new Error("NOT_FOUND");
  return project;
}

/** The etapa of a task created from mail: the project's current etapa, else the first live one. */
async function taskEtapaFor(project: { currentWorkflowId: string | null }): Promise<string> {
  if (project.currentWorkflowId) {
    const [current] = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.id, project.currentWorkflowId), isNull(workflows.deletedAt)))
      .limit(1);
    if (current) return current.id;
  }
  const [first] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(isNull(workflows.deletedAt), eq(workflows.active, true)))
    .orderBy(asc(workflows.sortOrder), asc(workflows.name))
    .limit(1);
  if (!first) throw new Error("INVALID: workflowId");
  return first.id;
}

/**
 * Links (or unlinks) one of the caller's cached threads. A new link writes
 * "Correo vinculado: <asunto>" to the project's history; nothing else of the
 * mail lands in a shared table (BE §9.8).
 */
async function linkThread(
  user: AuthenticatedUser,
  threadId: string,
  projectId: string | null,
): Promise<{ previousProjectId: string | null }> {
  const staffId = user.member.id;
  const thread = await gmailRepository.findGmailThread(db, staffId, threadId);
  if (!thread) throw new Error("NOT_FOUND");
  if (projectId !== null) await loadVisibleProject(user, projectId);

  const previousProjectId = thread.projectId;
  if (previousProjectId === projectId) return { previousProjectId };

  await db.transaction(async (tx) => {
    await gmailRepository.setGmailThreadProject(tx, staffId, threadId, projectId);
    if (projectId !== null) {
      await tx.insert(historyEvents).values({
        entity: "project",
        entityId: projectId,
        kind: "comentario",
        actorId: staffId,
        comment: `Correo vinculado: ${thread.subject.trim() || NO_SUBJECT}`,
      });
    }
  });
  return { previousProjectId };
}

/** The summary of a live read; `unread` is the cached flag (else Gmail's label), which mark-read clears. */
function threadSummaryFrom(parsed: ParsedGmailThread, cached: GmailThreadRow | null): GmailThreadSummary {
  const unreadInGmail = parsed.messages.some((m) => m.labelIds.includes("UNREAD"));
  if (cached) return toThreadSummary(cached);
  const first = parsed.messages[0]!;
  const last = parsed.messages[parsed.messages.length - 1]!;
  return {
    id: parsed.id,
    subject: first.subject,
    from: last.from,
    snippet: last.snippet,
    receivedAt: last.date,
    unread: unreadInGmail,
    projectId: null,
    suggestedProjectId: null,
  };
}

function gmailWebLink(email: string, threadId: string): string {
  const account = email ? `?authuser=${encodeURIComponent(email)}` : "";
  return `https://mail.google.com/mail/${account}#all/${encodeURIComponent(threadId)}`;
}

// ── Actions ─────────────────────────────────────────────────────────────────

export async function fetchGmailStatusAction(): Promise<GmailStatus> {
  const user = await requireCapabilityUser();
  return gmailStatusOf(await loadGmailAccess(db, user.member.id));
}

/** Cached threads (ILIKE subject/from/snippet; page 30). Errors: `NOT_CONNECTED`, `SCOPE_MISSING`. */
export async function fetchGmailThreadsAction(input: { query?: string; cursor?: string }): Promise<GmailThreadsPage> {
  const user = await requireCapabilityUser();
  const access = await loadGmailAccess(db, user.member.id);
  assertGmailAccess(access, { read: true });
  return listGmailThreadsPage(user.member.id, input);
}

/**
 * One thread read live (`html` sanitized). Read-only: it writes nothing,
 * neither in Gmail nor in the cache, and revalidates nothing; opening an
 * unread thread also calls `markGmailThreadReadAction`. Errors: `NOT_FOUND`,
 * `NOT_CONNECTED`, `SCOPE_MISSING`.
 */
export async function fetchGmailThreadAction(id: string): Promise<GmailThreadView> {
  const user = await requireCapabilityUser();
  const staffId = user.member.id;
  const threadId = requireThreadId(id);
  const access = await loadGmailAccess(db, staffId);
  assertGmailAccess(access, { read: true });

  const api = await gmailClient(staffId);
  const parsed = parseGmailThread(await api.getThread(threadId, "full"));
  const cached = await gmailRepository.findGmailThread(db, staffId, parsed.id);

  const messages: GmailMessage[] = parsed.messages.map((m) => ({
    id: m.id,
    from: m.from,
    to: m.to,
    cc: m.cc,
    date: m.date,
    html: m.html ? sanitizeEmailHtml(m.html) : "",
    text: m.text,
  }));
  const attachments = parsed.messages.flatMap((m) => m.attachments);
  return { thread: threadSummaryFrom(parsed, cached), messages, attachments };
}

/**
 * Marks one of the caller's threads read: the cached row, and in Gmail when
 * the grant allows label changes (`gmail.modify`; with read-only access Gmail
 * would refuse the call and flag the account, so only the cache changes).
 * The client patches `unread: false` into `me.gmail.*`. Errors (as
 * `{ ok: false }`): `NOT_FOUND`, `NOT_CONNECTED`, `SCOPE_MISSING`.
 */
export async function markGmailThreadReadAction(
  ...args: Parameters<typeof markGmailThreadReadActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof markGmailThreadReadActionImpl>>>> {
  return toActionResult(() => markGmailThreadReadActionImpl(...args));
}

async function markGmailThreadReadActionImpl(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  const staffId = user.member.id;
  const threadId = requireThreadId(id);
  const access = await loadGmailAccess(db, staffId);
  assertGmailAccess(access, { read: true });

  if (access.canModify) {
    const api = await gmailClient(staffId);
    await api.markThreadRead(threadId);
  }
  const cached = await gmailRepository.findGmailThread(db, staffId, threadId);
  if (cached?.unread) await gmailRepository.markGmailThreadRead(db, staffId, threadId);
}

/**
 * Errors (`{ ok: false }`): `NOT_CONNECTED`, `SCOPE_MISSING`, `RATE_LIMITED`
 * (< 30 s since last, or backoff). Ajustes › Integraciones invalidates
 * `me.gmail` and its page data.
 */
export async function syncGmailAction(
  ...args: Parameters<typeof syncGmailActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof syncGmailActionImpl>>>> {
  return toActionResult(() => syncGmailActionImpl(...args));
}

async function syncGmailActionImpl(): Promise<{ synced: number }> {
  const user = await requireCapabilityUser();
  const staffId = user.member.id;
  const access = await loadGmailAccess(db, staffId);
  assertGmailAccess(access, { read: true });

  const now = Date.now();
  const account = access.account;
  if (account?.lastSyncedAt && now - account.lastSyncedAt.getTime() < SYNC_MIN_INTERVAL_MS) {
    throw new Error("RATE_LIMITED");
  }
  if (account?.nextSyncAfter && account.nextSyncAfter.getTime() > now) throw new Error("RATE_LIMITED");

  const result = await syncGmail(db, staffId);
  return { synced: result.synced };
}

/**
 * Link (or unlink with `null`) a thread to a project; a link writes the
 * subject to the project history. Errors (as `{ ok: false }`): `NOT_FOUND`,
 * `FORBIDDEN`. Revalidates `/proyectos/[id]`; the client refreshes `me.gmail`.
 */
export async function linkGmailThreadToProjectAction(
  ...args: Parameters<typeof linkGmailThreadToProjectActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof linkGmailThreadToProjectActionImpl>>>> {
  return toActionResult(() => linkGmailThreadToProjectActionImpl(...args));
}

async function linkGmailThreadToProjectActionImpl(threadId: string, projectId: string | null): Promise<void> {
  const user = await requireCapabilityUser();
  const id = requireThreadId(threadId);
  const target = projectId === null ? null : parseInput(GmailTaskInputSchema.shape.projectId, projectId);

  await linkThread(user, id, target);
}

/**
 * Create or (with `draftId`) update a draft; returns a 10-minute confirm
 * token. Errors (as `{ ok: false }`): `INVALID`, `NOT_CONNECTED`,
 * `SCOPE_MISSING`, `NOT_FOUND`.
 */
export async function createGmailDraftAction(
  ...args: Parameters<typeof createGmailDraftActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createGmailDraftActionImpl>>>> {
  return toActionResult(() => createGmailDraftActionImpl(...args));
}

async function createGmailDraftActionImpl(input: {
  to: string[];
  subject: string;
  body: string;
  replyToThreadId?: string;
  draftId?: string;
}): Promise<GmailDraft> {
  const user = await requireCapabilityUser();
  const staffId = user.member.id;
  const parsed = parseInput(GmailDraftInputSchema, input);
  const access = await loadGmailAccess(db, staffId);
  assertGmailAccess(access, { compose: true, read: Boolean(parsed.replyToThreadId) });
  const secret = confirmTokenSecret();

  const api = await gmailClient(staffId);
  let inReplyTo: string | undefined;
  let references: string | undefined;
  if (parsed.replyToThreadId) {
    // The thread must be in the caller's own mailbox (Gmail answers 404 otherwise).
    const thread = parseGmailThread(await api.getThread(parsed.replyToThreadId, "metadata"));
    const last = thread.messages[thread.messages.length - 1]!;
    inReplyTo = last.messageIdHeader || undefined;
    references = last.references || undefined;
  }

  const raw = await buildRawEmail({
    to: parsed.to,
    subject: parsed.subject,
    body: parsed.body,
    inReplyTo,
    references,
  });
  // Gmail answers 404 for a draft that isn't in the caller's mailbox → NOT_FOUND.
  const draft = parsed.draftId
    ? await api.updateDraft(parsed.draftId, raw, parsed.replyToThreadId)
    : await api.createDraft(raw, parsed.replyToThreadId);

  const { confirmToken, expiresAt } = issueConfirmToken(secret, staffId, draft.id);
  return { draftId: draft.id, confirmToken, expiresAt: expiresAt.toISOString() };
}

/** Errors (as `{ ok: false }`): `CONFIRM_REQUIRED`, `EXPIRED`, `NOT_CONNECTED`. */
export async function sendGmailDraftAction(
  ...args: Parameters<typeof sendGmailDraftActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof sendGmailDraftActionImpl>>>> {
  return toActionResult(() => sendGmailDraftActionImpl(...args));
}

async function sendGmailDraftActionImpl(draftId: string, confirmToken: string): Promise<{ messageId: string }> {
  const user = await requireCapabilityUser();
  const staffId = user.member.id;
  if (typeof draftId !== "string" || !draftId.trim()) throw new Error("CONFIRM_REQUIRED");
  const access = await loadGmailAccess(db, staffId);
  assertGmailAccess(access, { compose: true });

  verifyConfirmToken(confirmTokenSecret(), staffId, draftId, typeof confirmToken === "string" ? confirmToken : null);
  const sent = await sendDraft(staffId, draftId);
  return { messageId: sent.messageId };
}

/**
 * Task from a thread (title defaults to the subject; also links the thread).
 * Auth: owner + `activities.canCreateActivity` + project visible.
 * Errors (as `{ ok: false }`): `NOT_FOUND`, `FORBIDDEN`, `NOT_CONNECTED`.
 */
export async function createTaskFromGmailThreadAction(
  ...args: Parameters<typeof createTaskFromGmailThreadActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createTaskFromGmailThreadActionImpl>>>> {
  return toActionResult(() => createTaskFromGmailThreadActionImpl(...args));
}

async function createTaskFromGmailThreadActionImpl(
  threadId: string,
  input: { projectId: string; title?: string },
): Promise<{ taskId: string }> {
  const user = await requireCapabilityUser();
  const staffId = user.member.id;
  if (!resolveActivitiesCapabilities(user).canCreateActivity) throw new Error("FORBIDDEN");
  const id = requireThreadId(threadId);
  const parsed = parseInput(GmailTaskInputSchema, input);

  const access = await loadGmailAccess(db, staffId);
  if (!access.connected) throw new Error("NOT_CONNECTED");

  const thread = await gmailRepository.findGmailThread(db, staffId, id);
  if (!thread) throw new Error("NOT_FOUND");
  const project = await loadVisibleProject(user, parsed.projectId);
  const workflowId = await taskEtapaFor(project);

  const sender = formatAddress({ name: thread.fromName, email: thread.fromEmail });
  const notes = [
    sender ? `De: ${sender}` : null,
    thread.snippet.trim() || null,
    `Gmail: ${gmailWebLink(user.email, thread.id)}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n\n");

  const task = await createUserTask(
    {
      projectId: project.id,
      title: parsed.title ?? (thread.subject.trim() || NO_SUBJECT),
      notes,
      workflowId,
    },
    staffId,
  );
  await linkThread(user, thread.id, project.id);
  return { taskId: task.id };
}

/**
 * Stop sync, delete the caller's cached threads, set `disconnected_at`. The
 * shared Google token is not revoked. No revalidation: Ajustes ›
 * Integraciones invalidates `me.gmail` and its page data.
 */
export async function disconnectGmailAction(
  ...args: Parameters<typeof disconnectGmailActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof disconnectGmailActionImpl>>>> {
  return toActionResult(() => disconnectGmailActionImpl(...args));
}

async function disconnectGmailActionImpl(): Promise<void> {
  const user = await requireCapabilityUser();
  const staffId = user.member.id;
  await db.transaction(async (tx) => {
    await gmailRepository.deleteGmailThreads(tx, staffId);
    await gmailRepository.markGmailDisconnected(tx, staffId, new Date());
  });
}
