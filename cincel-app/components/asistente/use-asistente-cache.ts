"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";

import { deleteAssistantThreadAction } from "@/lib/actions/assistant-actions";
import { keysForToolParts } from "@/lib/assistant/tool-invalidation";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { prependNewThread, threadTitleOf } from "@/lib/query/options/asistente";
import type { AsistentePageThread } from "@/lib/types/asistente";
import type { AssistantThreadSummary } from "@/lib/types/redesign";

/** What `useChat`'s `onFinish` hands over for one finished turn. */
export type AssistantTurn = { threadId: string; message: UIMessage; messages: UIMessage[] };

/**
 * The cache work after a chat turn (Query Migration Phase 10, #944):
 * - a thread the route just created is prepended to `asistente.threads()`;
 * - `asistente.thread(id)` gets the finished conversation, so coming back to
 *   it shows the last turn without a fetch;
 * - `asistente.threads()` is invalidated once (new title and order);
 * - the keys implied by the final message's tool parts are invalidated
 *   (`keysForToolParts`), so a note or task the assistant created shows up
 *   on its screen without a reload.
 */
export function useAssistantTurnFinished(): (turn: AssistantTurn) => void {
  const qc = useQueryClient();
  return useCallback(
    ({ threadId, message, messages }: AssistantTurn) => {
      const title = threadTitleOf(messages);
      prependNewThread(qc, { id: threadId, title });
      qc.setQueryData<AsistentePageThread | null>(qk.asistente.thread(threadId), (prev) => ({
        id: threadId,
        title: prev?.title ?? title,
        messages,
      }));
      void qc.invalidateQueries({ queryKey: qk.asistente.threads(), exact: true });
      for (const queryKey of keysForToolParts(message.parts)) void qc.invalidateQueries({ queryKey });
    },
    [qc],
  );
}

type DeleteSnapshot = { previous: AssistantThreadSummary[] | undefined };

/**
 * `deleteAssistantThreadAction`: optimistic on `asistente.threads()`, rolled
 * back on error; on success the thread's cache entry is removed. A stale
 * error (`NOT_FOUND`: it was already gone) refetches the list.
 */
export function useDeleteAssistantThread(opts: { onDeleted?(id: string): void } = {}) {
  const qc = useQueryClient();
  const { onDeleted } = opts;
  return useActionMutation<string, void, DeleteSnapshot>(deleteAssistantThreadAction, {
    optimistic: {
      onMutate: async (client, id) => {
        await client.cancelQueries({ queryKey: qk.asistente.threads(), exact: true });
        const previous = client.getQueryData<AssistantThreadSummary[]>(qk.asistente.threads());
        client.setQueryData<AssistantThreadSummary[]>(qk.asistente.threads(), (prev) =>
          prev?.filter((thread) => thread.id !== id),
        );
        return { previous };
      },
      rollback: (client, snap) => {
        client.setQueryData(qk.asistente.threads(), snap.previous);
      },
    },
    setData: (client, _data, id) => {
      client.removeQueries({ queryKey: qk.asistente.thread(id), exact: true });
      onDeleted?.(id);
    },
    onStaleError: () => {
      void qc.invalidateQueries({ queryKey: qk.asistente.threads(), exact: true });
    },
  });
}
