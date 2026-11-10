"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { newTaskInvalidations } from "@/components/tareas/NewTaskDialog";
import type { QuickAddCreated, QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { createUserTaskAction } from "@/lib/actions/tasks-actions";
import { useActionMutation } from "@/lib/query/mutation";
import { catalogProjectOptionsOptions, catalogWorkflowsOptions } from "@/lib/query/options/catalog";
import type { UserTaskInput } from "@/lib/types/core";
import type { TramoKey } from "@/lib/types/widgets";

const createTask = (input: UserTaskInput) => createUserTaskAction(input);

/** Where an Atención quick-add row creates: its project and the tramo keys listed under it. */
export type InicioQuickAddGroup = { projectId: string; tramoKeys: TramoKey[] };

/**
 * Atención quick-add (#991): creates through `createUserTaskAction` with the
 * new-task invalidations (`qk.inicio()` among them). The project comes from
 * the group; the tramo from the draft (`#tramo`), else the project's current
 * tramo, else the first tramo of the group. Responsable and date come from
 * the draft tokens. The project and tramo catalogs are read (and cached) on
 * the first create, never on mount.
 */
export function useInicioQuickAdd() {
  const qc = useQueryClient();
  const mutation = useActionMutation(createTask, {
    invalidate: (vars) => newTaskInvalidations(vars.projectId),
  });
  const { mutateAsync } = mutation;

  const create = useCallback(
    async (group: InicioQuickAddGroup, draft: QuickAddDraft): Promise<QuickAddCreated> => {
      const projectId = draft.projectId ?? group.projectId;
      const [workflows, projects] = draft.tramoId
        ? [null, null]
        : await Promise.all([
            qc.ensureQueryData(catalogWorkflowsOptions()).catch(() => null),
            qc.ensureQueryData(catalogProjectOptionsOptions()).catch(() => null),
          ]);
      const current = projects?.find((p) => p.id === projectId)?.currentWorkflowId ?? null;
      const fromGroup = group.tramoKeys
        .map((key) => workflows?.find((w) => w.key === key)?.id ?? null)
        .find((id): id is string => id !== null);
      const workflowId = draft.tramoId ?? current ?? fromGroup ?? null;
      const task = await mutateAsync({
        projectId,
        title: draft.title,
        workflowId,
        managerId: draft.assigneeId,
        priority: draft.priority,
        deliveryDate: draft.dueDate,
      });
      return { id: task.id, title: task.title };
    },
    [mutateAsync, qc],
  );

  return { create, pending: mutation.isPending };
}
