import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";

import { fetchAssistantThreadsAction } from "@/lib/actions/assistant-actions";
import { fetchAssistantThreadAction, lookupAssistantContextAction } from "@/lib/actions/page-data/asistente-actions";
import { STALE, qk } from "@/lib/query/keys";
import type { AsistentePageThread, AssistantContextIds, AssistantContextLabel } from "@/lib/types/asistente";
import type { AssistantContext, AssistantThreadSummary } from "@/lib/types/redesign";

/**
 * `queryOptions` for the assistant (Query Migration Phase 10, #944). The
 * `/asistente` page prefetches the same keys with `lib/loaders/asistente.ts`.
 * A thread is `staleTime: Infinity`: `useChat` owns the live conversation,
 * and the cache only seeds it. The query functions only read.
 */

/** The caller's live threads, newest first (≤ 50). */
export function asistenteThreadsOptions() {
  return queryOptions<AssistantThreadSummary[]>({
    queryKey: qk.asistente.threads(),
    queryFn: () => fetchAssistantThreadsAction(),
    staleTime: STALE.screen,
  });
}

/** One of the caller's threads with its last messages; null when it is gone or not theirs. */
export function asistenteThreadOptions(id: string) {
  return queryOptions<AsistentePageThread | null>({
    queryKey: qk.asistente.thread(id),
    queryFn: () => fetchAssistantThreadAction(id),
    staleTime: STALE.asistenteThread,
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The context ids the chip looks up: only uuid-shaped ones (a route segment
 * that isn't a uuid can't name an entity), lower-cased, so equal contexts
 * share one key.
 */
export function assistantContextIds(context: Partial<AssistantContext>): AssistantContextIds {
  const ids: AssistantContextIds = {};
  for (const name of ["projectId", "taskId", "personId"] as const) {
    const value = context[name]?.trim();
    if (value && UUID.test(value)) ids[name] = value.toLowerCase();
  }
  return ids;
}

export function hasContextIds(ids: AssistantContextIds): boolean {
  return Boolean(ids.projectId || ids.taskId || ids.personId);
}

/** The "Viendo:" chip: name-only `{ id, label }`, or null when nothing in the context is visible. */
export function asistenteContextOptions(ids: AssistantContextIds) {
  return queryOptions<AssistantContextLabel | null>({
    queryKey: qk.asistente.context(ids),
    queryFn: () => lookupAssistantContextAction(ids),
    staleTime: STALE.screen,
  });
}

/** The title the server gives a thread with no user text yet (`assistant_threads.title` default). */
const NEW_THREAD_TITLE = "Nueva conversación";
const TITLE_MAX = 80;

/** The first user message's text on one line, at most 80 characters (the server's title rule). */
export function threadTitleOf(messages: readonly UIMessage[]): string {
  const first = messages.find((message) => message.role === "user");
  const text = (first?.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return NEW_THREAD_TITLE;
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1).trimEnd()}…` : text;
}

/**
 * A thread the route just created goes to the top of `asistente.threads`
 * right away (titled from its first message until the list refetches).
 * No-op when the list isn't cached or already has it.
 */
export function prependNewThread(client: QueryClient, thread: { id: string; title: string }): void {
  client.setQueryData<AssistantThreadSummary[]>(qk.asistente.threads(), (prev) => {
    if (!prev || prev.some((t) => t.id === thread.id)) return prev;
    return [
      { id: thread.id, title: thread.title, updatedAt: new Date().toISOString() },
      ...prev,
    ];
  });
}
