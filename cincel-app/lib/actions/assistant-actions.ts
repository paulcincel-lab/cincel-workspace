"use server";

import type { UIMessage } from "ai";
import { revalidateAsistenteScreen } from "@/lib/cache/screens/asistente";

import { LEGACY_IMPORT_SOURCE, normalizeLegacyMessages, titleFromMessages } from "@/lib/assistant/legacy-import";
import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import * as assistantRepository from "@/lib/repositories/assistant-repository";
import type { AssistantActionRecord, AssistantContext, AssistantThreadSummary } from "@/lib/types/redesign";
import { parseInput } from "@/lib/validation/project-flow";
import { AssistantActionsQuerySchema, LegacyAssistantMessagesSchema, UuidSchema } from "@/lib/validation/redesign";

/**
 * Server-side assistant threads and the approval audit (redesign BE §7.9,
 * §8.10). Owner-only: every query is scoped to the session staff id, so
 * another user's thread id reads as `NOT_FOUND`. None of these call the
 * model. The chat route `POST /api/asistente/chat` is separate.
 */

const ASSISTANT_PATH = "/asistente";

async function sessionStaffId(): Promise<string> {
  const user = await requireCapabilityUser();
  return user.member.id;
}

/** A thread id that isn't a uuid can't exist: `NOT_FOUND`, never `INVALID`. */
function threadIdOrNotFound(id: unknown): string {
  const parsed = UuidSchema.safeParse(id);
  if (!parsed.success) throw new Error("NOT_FOUND");
  return parsed.data;
}

/** Live threads, newest first, max 50. */
export async function fetchAssistantThreadsAction(): Promise<AssistantThreadSummary[]> {
  const staffId = await sessionStaffId();
  const rows = await assistantRepository.listLiveAssistantThreads(db, staffId, assistantRepository.ASSISTANT_THREADS_KEEP);
  return rows.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() }));
}

/** The caller's live thread with its messages in order. Errors: `NOT_FOUND`. */
export async function fetchAssistantThreadAction(id: string): Promise<{
  thread: { id: string; title: string; context: AssistantContext; updatedAt: string };
  messages: UIMessage[];
}> {
  const staffId = await sessionStaffId();
  const threadId = threadIdOrNotFound(id);
  const thread = await assistantRepository.findOwnedAssistantThread(db, staffId, threadId);
  if (!thread) throw new Error("NOT_FOUND");
  const rows = await assistantRepository.listAssistantThreadMessages(db, thread.id);
  const messages: UIMessage[] = [];
  for (const row of rows) {
    if (row.role === "tool") continue;
    messages.push({ id: row.id, role: row.role, parts: row.parts as UIMessage["parts"] });
  }
  return {
    thread: {
      id: thread.id,
      title: thread.title,
      context: thread.context ?? { route: ASSISTANT_PATH },
      updatedAt: thread.updatedAt.toISOString(),
    },
    messages,
  };
}

/** Soft delete. Errors: `NOT_FOUND`. Revalidates `/asistente`. */
export async function deleteAssistantThreadAction(id: string): Promise<void> {
  const staffId = await sessionStaffId();
  const threadId = threadIdOrNotFound(id);
  const deleted = await assistantRepository.softDeleteOwnedAssistantThread(db, staffId, threadId);
  if (!deleted) throw new Error("NOT_FOUND");
  revalidateAsistenteScreen();
}

/**
 * Store previously saved chat messages (≤ 200) as a new thread; no model
 * call. No page calls it since the browser copy of the thread was retired. Tool parts are kept for display
 * only (`lib/assistant/legacy-import.ts`). Errors: `INVALID`. Revalidates `/asistente`.
 */
export async function importLegacyAssistantThreadAction(messages: UIMessage[]): Promise<{ id: string }> {
  const staffId = await sessionStaffId();
  const parsed = parseInput(LegacyAssistantMessagesSchema, messages);
  const rows = normalizeLegacyMessages(parsed);
  if (rows.length === 0) throw new Error("INVALID: messages");
  const created = await assistantRepository.createAssistantThreadWithMessages(db, staffId, {
    title: titleFromMessages(rows),
    context: { route: ASSISTANT_PATH },
    importedFrom: LEGACY_IMPORT_SOURCE,
    messages: rows,
  });
  revalidateAsistenteScreen();
  return { id: created.id };
}

/**
 * Audit of approval-gated tool calls, newest first, page 30. `cursor` is the
 * id of the last record of the previous page. Errors: `NOT_FOUND` (thread),
 * `INVALID` (input).
 */
export async function fetchAssistantActionsAction(input: {
  threadId?: string;
  cursor?: string;
}): Promise<AssistantActionRecord[]> {
  const staffId = await sessionStaffId();
  const parsed = parseInput(AssistantActionsQuerySchema, input ?? {});
  let cursorId: string | undefined;
  if (parsed.cursor) {
    const cursor = UuidSchema.safeParse(parsed.cursor);
    if (!cursor.success) throw new Error("INVALID: cursor");
    cursorId = cursor.data;
  }
  if (parsed.threadId) {
    // The audit outlives purged threads, so a soft-deleted thread of the caller still reads.
    const thread = await assistantRepository.findOwnedAssistantThread(db, staffId, parsed.threadId, {
      includeDeleted: true,
    });
    if (!thread) throw new Error("NOT_FOUND");
  }
  return assistantRepository.listAssistantActions(db, staffId, {
    threadId: parsed.threadId,
    cursorId,
    limit: assistantRepository.ASSISTANT_ACTIONS_PAGE,
  });
}
