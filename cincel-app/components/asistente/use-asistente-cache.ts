"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";

import {
  deleteAssistantThreadAction,
  markAssistantThreadReadAction,
  pinAssistantThreadAction,
} from "@/lib/actions/assistant-actions";
import { keysForToolParts } from "@/lib/assistant/tool-invalidation";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { patchThreadSummary, prependNewThread, threadTitleOf } from "@/lib/query/options/asistente";
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

type PinVars = { id: string; pinned: boolean };

/**
 * `pinAssistantThreadAction`: optimistic on `asistente.threads()` (the row
 * moves between Fijadas and Recientes at once), rolled back on error; on
 * success the server row replaces it.
 */
export function usePinAssistantThread() {
  const qc = useQueryClient();
  return useActionMutation<PinVars, AssistantThreadSummary, DeleteSnapshot>(pinAssistantThreadAction, {
    optimistic: {
      onMutate: async (client, { id, pinned }) => {
        await client.cancelQueries({ queryKey: qk.asistente.threads(), exact: true });
        const previous = client.getQueryData<AssistantThreadSummary[]>(qk.asistente.threads());
        patchThreadSummary(client, id, { pinnedAt: pinned ? new Date().toISOString() : null });
        return { previous };
      },
      rollback: (client, snap) => {
        client.setQueryData(qk.asistente.threads(), snap.previous);
      },
    },
    setData: (client, row) => {
      patchThreadSummary(client, row.id, row);
    },
    onStaleError: () => {
      void qc.invalidateQueries({ queryKey: qk.asistente.threads(), exact: true });
    },
  });
}

/**
 * Marks a thread read (on open and after each turn): the cached row stops
 * showing "Nueva respuesta" right away. Fire and forget; a failure only
 * leaves the line until the next list refetch.
 */
export function useMarkAssistantThreadRead(): (id: string) => void {
  const qc = useQueryClient();
  return useCallback(
    (id: string) => {
      patchThreadSummary(qc, id, { unread: false });
      markAssistantThreadReadAction({ id }).catch(() => {});
    },
    [qc],
  );
}
