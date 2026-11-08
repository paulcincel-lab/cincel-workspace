"use client";

import type { QueryKey } from "@tanstack/react-query";

import {
  createTaskFromGmailThreadAction,
  linkGmailThreadToProjectAction,
  markGmailThreadReadAction,
} from "@/lib/actions/gmail-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation, type ActionMutationOptions } from "@/lib/query/mutation";
import {
  patchCachedGmailThread,
  restoreSnapshot,
  snapshotGmailThreads,
  type GmailThreadsData,
  type Snapshot,
} from "@/lib/query/options/mi-espacio";
import type { GmailThreadView } from "@/lib/types/mi-espacio";

/**
 * The Gmail writes of the Bandeja and the reading pane (Query Migration
 * Phase 7, #941), shared so both surfaces update the same cache:
 *
 * - mark read: optimistic `unread: false` in `me.gmail.threads` and the open
 *   thread, rolled back silently on error;
 * - link / unlink: the thread's `projectId`, then `me.gmail` and both
 *   projects' detail and history;
 * - task from mail: the same plus `tareas`, `inicio` and `shell.badges`.
 */

export type LinkVars = { threadId: string; projectId: string | null; previousProjectId: string | null };
export type TaskVars = { threadId: string; projectId: string; title?: string; previousProjectId: string | null };

/** `proyectos.detail` and `proyectos.history` of each project the write touched. */
function projectKeys(...ids: (string | null)[]): QueryKey[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))].flatMap((id) => [
    qk.proyectos.detail(id),
    qk.proyectos.history(id),
  ]);
}

type Extra<V, R> = Pick<ActionMutationOptions<V, R, unknown>, "onFormError" | "successToast">;

export function useLinkGmailThread(extra: Extra<LinkVars, void> = {}) {
  return useActionMutation<LinkVars, void>(
    ({ threadId, projectId }) => linkGmailThreadToProjectAction(threadId, projectId),
    {
      ...extra,
      errorContext: "gmail",
      setData: (qc, _data, { threadId, projectId }) => patchCachedGmailThread(qc, threadId, { projectId }),
      invalidate: ({ projectId, previousProjectId }) => [qk.me.gmail.all, ...projectKeys(projectId, previousProjectId)],
    },
  );
}

export function useCreateTaskFromGmailThread(extra: Extra<TaskVars, { taskId: string }> = {}) {
  return useActionMutation<TaskVars, { taskId: string }>(
    ({ threadId, projectId, title }) =>
      createTaskFromGmailThreadAction(threadId, { projectId, ...(title ? { title } : {}) }),
    {
      ...extra,
      errorContext: "gmail",
      setData: (qc, _data, { threadId, projectId }) => patchCachedGmailThread(qc, threadId, { projectId }),
      invalidate: ({ projectId, previousProjectId }) => [
        qk.me.gmail.all,
        ...projectKeys(projectId, previousProjectId),
        qk.tareas.all,
        qk.inicio(),
        qk.shell.badges(),
      ],
    },
  );
}

type MarkReadSnapshot = { threads: Snapshot<GmailThreadsData>; thread: Snapshot<GmailThreadView> };

/** Gmail threads don't count toward the sidebar badge, so `shell.badges` stays as it is. */
export function useMarkGmailThreadRead() {
  return useActionMutation<string, void, MarkReadSnapshot>(markGmailThreadReadAction, {
    optimistic: {
      async onMutate(qc, threadId) {
        const threads = await snapshotGmailThreads(qc);
        const key = qk.me.gmail.thread(threadId);
        const thread: Snapshot<GmailThreadView> = { key, data: qc.getQueryData<GmailThreadView>(key) };
        patchCachedGmailThread(qc, threadId, { unread: false });
        return { threads, thread };
      },
      rollback(qc, snap) {
        restoreSnapshot(qc, snap.threads);
        restoreSnapshot(qc, snap.thread);
      },
    },
    // A failed mark-read only puts the unread mark back; it never interrupts reading.
    onFormError: () => undefined,
  });
}
