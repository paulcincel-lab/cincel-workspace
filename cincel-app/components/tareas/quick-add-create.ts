"use client";

import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { QuickAddCreated, QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { setTaskEstimatedHoursAction } from "@/lib/actions/calendario-actions";
import { createSubtaskAction, createUserTaskAction, deleteTaskAction, setTaskCustomStatusAction, setTaskStatusAction } from "@/lib/actions/tasks-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { STALE, qk } from "@/lib/query/keys";
import { mutationErrorText, runAction, useActionMutation } from "@/lib/query/mutation";
import type { SubtaskInput, TaskDetail, UserTaskInput, WorkflowDetail } from "@/lib/types/core";

import {
  activeWorkflowsInOrder,
  draftFromDefaults,
  initialStatusTarget,
  resolvePhaseId,
  resolveWorkflowId,
  toUserTaskInput,
  tramoFases,
} from "./new-task-form";

/**
 * Task creation shared by `NewTaskDialog` and the smart quick-add
 * (`QuickAddRow`): the tramo catalog key, the keys a created task makes
 * stale, the create → board status → subtareas sequence and the quick-add
 * hooks (create without a toast, undo).
 */

/**
 * The tramo catalog with its fases and task templates (the Fase field and
 * "Usar plantilla del tramo" need them). Kept under the `catalog.workflows`
 * prefix, so every invalidation of `qk.catalog.workflows()` refreshes it.
 */
export const newTaskWorkflowsKey = () => [...qk.catalog.workflows(), "detail"] as const;

/** Keys a created task (and its subtareas) makes stale (plan §3, `createUserTaskAction` / `createSubtaskAction`). */
export function newTaskInvalidations(projectId: string, created?: { taskId: string; withSubtasks: boolean }) {
  const keys: (readonly unknown[])[] = [
    qk.tareas.all,
    qk.proyectos.tab(projectId, "tareas"),
    qk.proyectos.shell(projectId),
    qk.proyectos.resumen(projectId),
    qk.proyectos.list(),
    qk.inicio(),
    qk.shell.badges(),
    qk.me.tasks(),
  ];
  if (created?.withSubtasks) keys.push(qk.tasks.detail(created.taskId), qk.tasks.subtasks(created.taskId));
  return keys;
}

export type CreateTaskVars = { input: UserTaskInput; statusKey?: string; subtasks: SubtaskInput[]; /** Planned hours (`~2h` in quick-add), saved after the create. */ estimatedHours?: number };
export type CreateTaskResult = { task: TaskDetail; partialError: unknown };

/**
 * `createUserTaskAction`, then the board column's status, then one
 * `createSubtaskAction` per subtarea. Only the create can fail the call: once
 * the task exists a failed status move or subtarea is reported, not retried,
 * so a second "Crear tarea" can't duplicate the task.
 */
export async function createTaskWithExtras({ input, statusKey, subtasks, estimatedHours }: CreateTaskVars): Promise<CreateTaskResult> {
  const task = await runAction(createUserTaskAction, input);
  let partialError: unknown = null;
  const target = initialStatusTarget(statusKey, task);
  if (target) {
    try {
      if (target.kind === "custom") await runAction(() => setTaskCustomStatusAction(task.id, target.id), undefined);
      else await runAction(() => setTaskStatusAction(task.id, target.status), undefined);
    } catch (err) {
      partialError = err;
    }
  }
  if (estimatedHours !== undefined) {
    try {
      await runAction(() => setTaskEstimatedHoursAction(task.id, estimatedHours), undefined);
    } catch (err) {
      partialError ??= err;
    }
  }
  for (const subtask of subtasks) {
    try {
      await runAction((v: SubtaskInput) => createSubtaskAction(task.id, v), subtask);
    } catch (err) {
      partialError ??= err;
    }
  }
  return { task, partialError };
}

/**
 * The `createTaskWithExtras` input for a quick-add draft: its tramo (else the
 * first active one) on the tramo's first fase, the assignee as responsable,
 * the date as delivery date, the priority (media by default) and the board
 * column as `statusKey`. Throws `INVALID` without a project.
 */
export function quickAddTaskVars(draft: QuickAddDraft, workflows: readonly WorkflowDetail[]): CreateTaskVars {
  if (!draft.projectId) throw new Error("INVALID");
  const workflowId = resolveWorkflowId(draft.tramoId, workflows);
  const fases = tramoFases(workflows.find((w) => w.id === workflowId));
  const resolved = {
    ...draftFromDefaults({ title: draft.title }),
    projectId: draft.projectId,
    workflowId,
    phaseId: resolvePhaseId(null, fases),
    managerId: draft.assigneeId,
    deliveryDate: draft.dueDate ?? "",
    priority: draft.priority ?? "media",
  };
  return {
    input: toUserTaskInput(resolved, fases),
    ...(draft.status ? { statusKey: draft.status } : {}),
    ...(draft.estimatedHours !== undefined ? { estimatedHours: draft.estimatedHours } : {}),
    subtasks: [],
  };
}

/** The `createSubtaskAction` input of a "+ Subtarea…" draft (#1048): title, responsable, date and priority. */
export function quickAddSubtaskInput(draft: QuickAddDraft): SubtaskInput {
  return {
    title: draft.title,
    managerId: draft.assigneeId,
    deliveryDate: draft.dueDate,
    priority: draft.priority ?? "media",
  };
}

/** Keys a subtask created inline makes stale: the parent's rows and counts, and the Tareas views. */
export function quickAddSubtaskInvalidations(parentId: string, projectId: string) {
  return [qk.tasks.children(parentId), qk.tasks.detail(parentId), ...newTaskInvalidations(projectId, { taskId: parentId, withSubtasks: true })];
}

/** Deletes a just-created task ("Deshacer") and refreshes the views showing tasks. */
export function useQuickAddUndo(projectId: string | null, parentTaskId?: string): (id: string) => Promise<void> {
  const mutation = useActionMutation((id: string) => deleteTaskAction(id), {
    invalidate: () =>
      parentTaskId ? quickAddSubtaskInvalidations(parentTaskId, projectId ?? "") : newTaskInvalidations(projectId ?? ""),
  });
  return async (id: string) => {
    await mutation.mutateAsync(id);
  };
}

/**
 * Quick-add creation: `create(draft)` maps the draft through
 * `quickAddTaskVars` (loading the tramo catalog if needed) and runs
 * `createTaskWithExtras` with the same invalidations as the dialog; no
 * success toast (the row's status line replaces it), errors as a toast.
 * `undo(id)` deletes a task it created.
 */
export function useQuickAddCreate(): {
  create(d: QuickAddDraft): Promise<QuickAddCreated>;
  undo(id: string): Promise<void>;
} {
  const qc = useQueryClient();
  const projects = useRef(new Map<string, string>());

  const createMutation = useActionMutation(
    async (draft: QuickAddDraft): Promise<CreateTaskResult> => {
      if (draft.parentTaskId) {
        const parentId = draft.parentTaskId;
        const task = await runAction((v: SubtaskInput) => createSubtaskAction(parentId, v), quickAddSubtaskInput(draft));
        let partialError: unknown = null;
        if (draft.estimatedHours !== undefined) {
          const hours = draft.estimatedHours;
          try {
            await runAction(() => setTaskEstimatedHoursAction(task.id, hours), undefined);
          } catch (err) {
            partialError = err;
          }
        }
        return { task, partialError };
      }
      const rows = await qc.ensureQueryData({
        queryKey: newTaskWorkflowsKey(),
        queryFn: () => runAction(fetchWorkflowsAction, {}),
        staleTime: STALE.catalog,
      });
      return createTaskWithExtras(quickAddTaskVars(draft, activeWorkflowsInOrder(rows)));
    },
    {
      invalidate: (draft, data) => {
        if (!data || !draft.projectId) return [];
        const keys = draft.parentTaskId
          ? quickAddSubtaskInvalidations(draft.parentTaskId, draft.projectId)
          : newTaskInvalidations(draft.projectId, { taskId: data.task.id, withSubtasks: false });
        // Planned hours move the calendar's day meters.
        return draft.estimatedHours !== undefined ? [...keys, qk.calendario.all] : keys;
      },
      partialFailure: (data) => (data.partialError ? mutationErrorText(data.partialError) : null),
    },
  );

  const undoMutation = useActionMutation((id: string) => deleteTaskAction(id), {
    invalidate: (id) => newTaskInvalidations(projects.current.get(id) ?? ""),
  });

  return {
    async create(draft) {
      const { task } = await createMutation.mutateAsync(draft);
      if (draft.projectId) projects.current.set(task.id, draft.projectId);
      return { id: task.id, title: task.title };
    },
    async undo(id) {
      await undoMutation.mutateAsync(id);
    },
  };
}
