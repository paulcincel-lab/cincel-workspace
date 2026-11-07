"use server";

import { notImplementedAction, stubDefault } from "@/lib/stubs";
import type {
  GmailAttachment,
  GmailDraft,
  GmailMessage,
  GmailStatus,
  GmailThreadSummary,
} from "@/lib/types/redesign";

/**
 * Gmail read + draft (redesign BE §7.6). Owner-only; extends
 * `lib/google/staff-token.ts` and the incremental-grant flow. Phase 1 stubs
 * report "not connected".
 */

export async function fetchGmailStatusAction(): Promise<GmailStatus> {
  return stubDefault<GmailStatus>({ connected: false, scopeOk: false, lastSyncedAt: null, lastError: null });
}

/** Cached threads (ILIKE subject/from/snippet; page 30). Errors: `NOT_CONNECTED`, `SCOPE_MISSING`. */
export async function fetchGmailThreadsAction(input: {
  query?: string;
  cursor?: string;
}): Promise<{ threads: GmailThreadSummary[]; nextCursor: string | null }> {
  return stubDefault<{ threads: GmailThreadSummary[]; nextCursor: string | null }>({ threads: [], nextCursor: null }, input);
}

/**
 * One thread read live (marks it read; `html` sanitized). Errors: `NOT_FOUND`,
 * `NOT_CONNECTED`, `SCOPE_MISSING`. The stub reports `NOT_CONNECTED`, matching
 * `fetchGmailStatusAction` (there is no thread to return).
 */
export async function fetchGmailThreadAction(
  id: string,
): Promise<{ thread: GmailThreadSummary; messages: GmailMessage[]; attachments: GmailAttachment[] }> {
  void id;
  throw new Error("NOT_CONNECTED");
}

/** Errors: `NOT_CONNECTED`, `RATE_LIMITED` (< 30 s since last, or backoff). Revalidates `/mi-espacio`. */
export async function syncGmailAction(): Promise<{ synced: number }> {
  return notImplementedAction("syncGmailAction");
}

/**
 * Link (or unlink with `null`) a thread to a project; a link writes the
 * subject to the project history. Errors: `NOT_FOUND`, `FORBIDDEN`.
 * Revalidates `/mi-espacio`, `/proyectos/[id]`.
 */
export async function linkGmailThreadToProjectAction(threadId: string, projectId: string | null): Promise<void> {
  return notImplementedAction("linkGmailThreadToProjectAction", threadId, projectId);
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
  return notImplementedAction("createGmailDraftAction", input);
}

/** Errors: `CONFIRM_REQUIRED`, `EXPIRED`, `NOT_CONNECTED`. Revalidates `/mi-espacio`. */
export async function sendGmailDraftAction(draftId: string, confirmToken: string): Promise<{ messageId: string }> {
  return notImplementedAction("sendGmailDraftAction", draftId, confirmToken);
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
  return notImplementedAction("createTaskFromGmailThreadAction", threadId, input);
}

/**
 * Stop sync, delete the caller's cached threads, set `disconnected_at`. The
 * shared Google token is not revoked. Revalidates `/mi-espacio`, `/ajustes/integraciones`.
 */
export async function disconnectGmailAction(): Promise<void> {
  return notImplementedAction("disconnectGmailAction");
}
