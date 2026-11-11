"use client";

import type { QueryClient } from "@tanstack/react-query";

import * as tasksActions from "@/lib/actions/tasks-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import {
  taskAssignInvalidations,
  taskStatusInvalidations,
  taskUpdateInvalidations,
} from "@/lib/query/options/tareas";
import type { ParsedStatusValue } from "@/lib/tasks/status-options";
import type {
  HistoryEvent,
  TaskAttachment,
  TaskDetail,
  TaskPatch,
  TaskStatusOption,
} from "@/lib/types/core";

/**
 * The task sheet's mutations (Query Migration 4b, #956), one hook per action,
 * each with the cache work of plan §3: the detail is written from the result
 * (`setQueryData`) or patched optimistically, and only the keys the edit can
 * change are invalidated. Actions are imported by module (`tasksActions.*`):
 * `setTaskStatusAction` also exists in other action files.
 */

type Detail = TaskDetail | null | undefined;
type Snapshot = { previous: Detail };

/** The task fields a mutation needs: its id and project. */
export type TaskSheetTarget = Pick<TaskDetail, "id" | "projectId">;

/** Options every sheet mutation takes: where its error copy goes (the sheet's alert). */
export type TaskSheetMutationOptions = { onError(text: string): void };

function detailKey(id: string) {
  return qk.tasks.detail(id);
}

/** Writes the detail an action returned. */
function setDetail(qc: QueryClient, task: TaskDetail): void {
  qc.setQueryData<TaskDetail | null>(detailKey(task.id), task);
}

/** Patches the cached detail (if any) after cancelling its in-flight fetch; returns the rollback snapshot. */
async function patchDetail(qc: QueryClient, id: string, patch: (task: TaskDetail) => TaskDetail): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: detailKey(id), exact: true });
  const previous = qc.getQueryData<TaskDetail | null>(detailKey(id));
  if (previous) qc.setQueryData<TaskDetail | null>(detailKey(id), patch(previous));
  return { previous };
}

function restoreDetail(qc: QueryClient, id: string, snap: Snapshot): void {
  if (snap.previous !== undefined) qc.setQueryData(detailKey(id), snap.previous);
}

/** Refetches the detail only (not its subtareas or dependencies, which share the key prefix). */
function refreshDetail(qc: QueryClient, id: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: detailKey(id), exact: true });
}

/** `updateTaskAction`: the detail from the result; every Tareas view, the project's Tareas tab and Inicio. */
export function useUpdateTaskMutation(task: TaskSheetTarget, options: TaskSheetMutationOptions) {
  return useActionMutation<TaskPatch, TaskDetail>((patch) => tasksActions.updateTaskAction(task.id, patch), {
    setData: (qc, result) => setDetail(qc, result),
    invalidate: () => taskUpdateInvalidations(task.projectId),
    onFormError: options.onError,
  });
}

/**
 * `setTaskStatusAction` / `setTaskCustomStatusAction`: the detail moves to the
 * new status right away (rolled back on error), then the result replaces it.
 */
export function useTaskStatusMutation(
  task: TaskSheetTarget,
  statuses: readonly TaskStatusOption[],
  options: TaskSheetMutationOptions,
) {
  return useActionMutation<ParsedStatusValue, TaskDetail, Snapshot>(
    (value) =>
      value.kind === "custom"
        ? tasksActions.setTaskCustomStatusAction(task.id, value.id)
        : tasksActions.setTaskStatusAction(task.id, value.status),
    {
      optimistic: {
        onMutate: (qc, value) =>
          patchDetail(qc, task.id, (current) => {
            if (value.kind === "base") return { ...current, status: value.status, customStatus: null };
            const custom = statuses.find((s) => s.id === value.id);
            if (!custom) return current;
            return {
              ...current,
              status: custom.closes ? "completado" : "en_proceso",
              customStatus: {
                id: custom.id,
                name: custom.name,
                closes: custom.closes,
                countsAsCompleted: custom.countsAsCompleted,
              },
            };
          }),
        rollback: (qc, snap) => restoreDetail(qc, task.id, snap),
      },
      setData: (qc, result) => setDetail(qc, result),
      invalidate: () => taskStatusInvalidations(task.projectId),
      onFormError: options.onError,
    },
  );
}

/** `assignTaskAction`: the detail from the result; every Tareas view, Inicio and the shell badges. */
export function useAssignTaskMutation(task: TaskSheetTarget, options: TaskSheetMutationOptions) {
  return useActionMutation<string | null, TaskDetail>((managerId) => tasksActions.assignTaskAction(task.id, managerId), {
    setData: (qc, result) => setDetail(qc, result),
    invalidate: () => taskAssignInvalidations(),
    onFormError: options.onError,
  });
}

/** `addTaskCommentAction`: the new event is added to the detail's history from the result. */
export function useAddTaskCommentMutation(task: TaskSheetTarget, options: TaskSheetMutationOptions) {
  return useActionMutation<string, HistoryEvent>((comment) => tasksActions.addTaskCommentAction(task.id, comment), {
    setData: (qc, event) => {
      qc.setQueryData<TaskDetail | null>(detailKey(task.id), (current) =>
        current ? { ...current, history: [event, ...current.history.filter((e) => e.id !== event.id)] } : current,
      );
    },
    onFormError: options.onError,
  });
}

export type AttachmentVars = { file: File };

/**
 * `addTaskAttachmentAction`: the attachment is added from the result, then
 * the detail is refetched for the comment the upload records in its history.
 */
export function useAddTaskAttachmentMutation(task: TaskSheetTarget, options: TaskSheetMutationOptions) {
  return useActionMutation<AttachmentVars, TaskAttachment>(
    ({ file }) => {
      const formData = new FormData();
      formData.append("file", file);
      return tasksActions.addTaskAttachmentAction(task.id, formData);
    },
    {
      setData: (qc, attachment) => {
        qc.setQueryData<TaskDetail | null>(detailKey(task.id), (current) =>
          current
            ? { ...current, attachments: [...current.attachments.filter((a) => a.id !== attachment.id), attachment] }
            : current,
        );
        void refreshDetail(qc, task.id);
      },
      onFormError: options.onError,
    },
  );
}
