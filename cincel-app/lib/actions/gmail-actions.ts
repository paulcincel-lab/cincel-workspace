"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidateAjustesScreen } from "@/lib/cache/screens/ajustes";
import { revalidateMiEspacioScreen } from "@/lib/cache/screens/mi-espacio";
import { revalidateProyectoFichaScreen } from "@/lib/cache/screens/proyectos";
import { revalidateTareasScreen } from "@/lib/cache/screens/tareas";

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
import * as gmailRepository from "@/lib/repositories/gmail-repository";
import type { GmailThreadRow } from "@/lib/repositories/gmail-repository";
import { createUserTask } from "@/lib/repositories/tasks-repository";
import type {
  GmailAttachment,
  GmailDraft,
  GmailMessage,
  GmailStatus,
  GmailThreadSummary,
} from "@/lib/types/redesign";
import {
  GmailDraftInputSchema,
  GmailTaskInputSchema,
  GmailThreadsQuerySchema,
  parseInput,
} from "@/lib/validation/redesign";

/**
 * Gmail read + draft (redesign BE §7.6). Owner-only: every call works on the
 * caller's own mailbox (their own Google token, `users/me`) and the caller's
 * own `gmail_threads` rows; nobody else's Gmail data is ever returned,
 * including to administrators (BE §9.8).
 */

/** Threads per page of `fetchGmailThreadsAction`. */
const THREADS_PAGE_SIZE = 30;
/** Minimum gap between two manual syncs. */
const SYNC_MIN_INTERVAL_MS = 30 * 1000;
const NO_SUBJECT = "(sin asunto)";

function revalidateMiEspacio() {
  revalidateMiEspacioScreen(["miEspacioLayout"]);
}

function revalidateProject(projectId: string) {
  revalidateProyectoFichaScreen(projectId, ["projectLayout"]);
}

function toSummary(row: GmailThreadRow): GmailThreadSummary {
  return {
    id: row.id,
    subject: row.subject,
    from: formatAddress({ name: row.fromName, email: row.fromEmail }),
    snippet: row.snippet,
    receivedAt: row.receivedAt.toISOString(),
    unread: row.unread,
    projectId: row.projectId,
    suggestedProjectId: row.suggestedProjectId,
  };
}

function encodeCursor(row: GmailThreadRow): string {
  return Buffer.from(JSON.stringify([row.receivedAt.toISOString(), row.id])).toString("base64url");
}

function decodeCursor(cursor: string): gmailRepository.GmailThreadsCursor {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "string") {
      const receivedAt = new Date(value[0]);
      if (!Number.isNaN(receivedAt.getTime())) return { receivedAt, id: value[1] };
    }
  } catch {
    // falls through to INVALID
  }
  throw new Error("INVALID: cursor");
}

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

/** The tramo of a task created from mail: the project's current tramo, else the first live one. */
async function taskTramoFor(project: { currentWorkflowId: string | null }): Promise<string> {
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

function threadSummaryFrom(parsed: ParsedGmailThread, cached: GmailThreadRow | null): GmailThreadSummary {
  if (cached) return { ...toSummary(cached), unread: false };
  const first = parsed.messages[0]!;
  const last = parsed.messages[parsed.messages.length - 1]!;
  return {
    id: parsed.id,
    subject: first.subject,
    from: last.from,
    snippet: last.snippet,
    receivedAt: last.date,
    unread: false,
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
  const access = await loadGmailAccess(db, user.member.id);
  return {
    connected: access.connected,
    scopeOk: access.scopeOk,
    lastSyncedAt: access.account?.lastSyncedAt?.toISOString() ?? null,
    lastError: access.account?.lastError ?? null,
  };
}

/** Cached threads (ILIKE subject/from/snippet; page 30). Errors: `NOT_CONNECTED`, `SCOPE_MISSING`. */
export async function fetchGmailThreadsAction(input: {
  query?: string;
  cursor?: string;
}): Promise<{ threads: GmailThreadSummary[]; nextCursor: string | null }> {
  const user = await requireCapabilityUser();
  const parsed = parseInput(GmailThreadsQuerySchema, input ?? {});
  const access = await loadGmailAccess(db, user.member.id);
  assertGmailAccess(access, { read: true });

  const rows = await gmailRepository.listGmailThreads(db, user.member.id, {
    query: parsed.query,
    cursor: parsed.cursor ? decodeCursor(parsed.cursor) : null,
    limit: THREADS_PAGE_SIZE + 1,
  });
  const page = rows.slice(0, THREADS_PAGE_SIZE);
  return {
    threads: page.map(toSummary),
    nextCursor: rows.length > THREADS_PAGE_SIZE ? encodeCursor(page[page.length - 1]!) : null,
  };
}

/**
 * One thread read live (marks it read; `html` sanitized). Errors: `NOT_FOUND`,
 * `NOT_CONNECTED`, `SCOPE_MISSING`. Gmail only lets a grant with label
 * access (`gmail.modify`) change labels; with read-only access the call
 * would fail and flag the account, so the thread is then marked read in the
 * cache only.
 */
export async function fetchGmailThreadAction(
  id: string,
): Promise<{ thread: GmailThreadSummary; messages: GmailMessage[]; attachments: GmailAttachment[] }> {
  const user = await requireCapabilityUser();
  const staffId = user.member.id;
  const threadId = requireThreadId(id);
  const access = await loadGmailAccess(db, staffId);
  assertGmailAccess(access, { read: true });

  const api = await gmailClient(staffId);
  const parsed = parseGmailThread(await api.getThread(threadId, "full"));
  const cached = await gmailRepository.findGmailThread(db, staffId, parsed.id);

  const unreadInGmail = parsed.messages.some((m) => m.labelIds.includes("UNREAD"));
  if (unreadInGmail && access.canModify) await api.markThreadRead(parsed.id);
  if (cached?.unread) await gmailRepository.markGmailThreadRead(db, staffId, parsed.id);

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
  if (cached?.unread) revalidateMiEspacio();
  return { thread: threadSummaryFrom(parsed, cached), messages, attachments };
}

/** Errors: `NOT_CONNECTED`, `RATE_LIMITED` (< 30 s since last, or backoff). Revalidates `/mi-espacio`. */
export async function syncGmailAction(): Promise<{ synced: number }> {
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
  revalidateMiEspacio();
  return { synced: result.synced };
}

/**
 * Link (or unlink with `null`) a thread to a project; a link writes the
 * subject to the project history. Errors: `NOT_FOUND`, `FORBIDDEN`.
 * Revalidates `/mi-espacio`, `/proyectos/[id]`.
 */
export async function linkGmailThreadToProjectAction(threadId: string, projectId: string | null): Promise<void> {
  const user = await requireCapabilityUser();
  const id = requireThreadId(threadId);
  const target = projectId === null ? null : parseInput(GmailTaskInputSchema.shape.projectId, projectId);

  const { previousProjectId } = await linkThread(user, id, target);
  revalidateMiEspacio();
  if (target) revalidateProject(target);
  if (previousProjectId && previousProjectId !== target) revalidateProject(previousProjectId);
}

/**
 * Create or (with `draftId`) update a draft; returns a 10-minute confirm
 * token. Errors: `INVALID`, `NOT_CONNECTED`, `SCOPE_MISSING`, `NOT_FOUND`.
 */
export async function createGmailDraftAction(input: {
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

/** Errors: `CONFIRM_REQUIRED`, `EXPIRED`, `NOT_CONNECTED`. Revalidates `/mi-espacio`. */
export async function sendGmailDraftAction(draftId: string, confirmToken: string): Promise<{ messageId: string }> {
  const user = await requireCapabilityUser();
  const staffId = user.member.id;
  if (typeof draftId !== "string" || !draftId.trim()) throw new Error("CONFIRM_REQUIRED");
  const access = await loadGmailAccess(db, staffId);
  assertGmailAccess(access, { compose: true });

  verifyConfirmToken(confirmTokenSecret(), staffId, draftId, typeof confirmToken === "string" ? confirmToken : null);
  const sent = await sendDraft(staffId, draftId);
  revalidateMiEspacio();
  return { messageId: sent.messageId };
}

/**
 * Task from a thread (title defaults to the subject; also links the thread).
 * Auth: owner + `activities.canCreateActivity` + project visible.
 * Errors: `NOT_FOUND`, `FORBIDDEN`, `NOT_CONNECTED`.
 */
export async function createTaskFromGmailThreadAction(
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
  const workflowId = await taskTramoFor(project);

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
  const { previousProjectId } = await linkThread(user, thread.id, project.id);

  revalidateMiEspacio();
  revalidateTareasScreen(["tareas"]);
  revalidateProject(project.id);
  if (previousProjectId && previousProjectId !== project.id) revalidateProject(previousProjectId);
  return { taskId: task.id };
}

/**
 * Stop sync, delete the caller's cached threads, set `disconnected_at`. The
 * shared Google token is not revoked. Revalidates `/mi-espacio`, `/ajustes/integraciones`.
 */
export async function disconnectGmailAction(): Promise<void> {
  const user = await requireCapabilityUser();
  const staffId = user.member.id;
  await db.transaction(async (tx) => {
    await gmailRepository.deleteGmailThreads(tx, staffId);
    await gmailRepository.markGmailDisconnected(tx, staffId, new Date());
  });
  revalidateMiEspacio();
  revalidateAjustesScreen("integraciones");
}
