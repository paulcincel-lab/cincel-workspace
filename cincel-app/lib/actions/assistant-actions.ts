"use server";

import type { UIMessage } from "ai";

import { notImplementedAction, stubDefault } from "@/lib/stubs";
import type { AssistantActionRecord, AssistantContext, AssistantThreadSummary } from "@/lib/types/redesign";

/**
 * Server-side assistant threads and the approval audit (redesign BE §7.9,
 * §8.10). Owner-only. The chat route `POST /api/asistente/chat` is separate.
 */

/** Live threads, newest first, max 50. */
export async function fetchAssistantThreadsAction(): Promise<AssistantThreadSummary[]> {
  return stubDefault<AssistantThreadSummary[]>([]);
}

/** Errors: `NOT_FOUND` (the stub has no threads, so every id is not found). */
export async function fetchAssistantThreadAction(id: string): Promise<{
  thread: { id: string; title: string; context: AssistantContext; updatedAt: string };
  messages: UIMessage[];
}> {
  void id;
  throw new Error("NOT_FOUND");
}

/** Soft delete. Errors: `NOT_FOUND`. Revalidates `/asistente`. */
export async function deleteAssistantThreadAction(id: string): Promise<void> {
  return notImplementedAction("deleteAssistantThreadAction", id);
}

/**
 * Store the legacy localStorage thread (`cincel.asistente.thread.v1`, ≤ 200
 * messages) as a new thread; no model call. Errors: `INVALID`. Revalidates `/asistente`.
 */
export async function importLegacyAssistantThreadAction(messages: UIMessage[]): Promise<{ id: string }> {
  return notImplementedAction("importLegacyAssistantThreadAction", messages);
}

/** Audit of approval-gated tool calls, newest first, page 30. Errors: `NOT_FOUND` (thread). */
export async function fetchAssistantActionsAction(input: {
  threadId?: string;
  cursor?: string;
}): Promise<AssistantActionRecord[]> {
  return stubDefault<AssistantActionRecord[]>([], input);
}
