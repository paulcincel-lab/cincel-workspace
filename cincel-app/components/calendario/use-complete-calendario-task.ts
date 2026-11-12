"use client";

import { useCallback } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { setTaskStatusAction } from "@/lib/actions/tasks-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { taskStatusInvalidations } from "@/lib/query/options/tareas";
import type { CalItem, CalTaskItem, CalendarioRange } from "@/lib/types/calendario";
import type { TaskStatus } from "@/lib/types/core";

export const TASK_COMPLETED_TOAST = "Tarea completada.";
export const UNDO_LABEL = "Deshacer";
const COMPLETED_LABEL = "Completada";

type CompleteVars = { taskId: string; status: TaskStatus; previous: CalTaskItem };
type RangeSnapshot = [readonly unknown[], CalendarioRange | undefined][];

function rangeEntries(qc: QueryClient) {
  return qc
    .getQueriesData<CalendarioRange>({ queryKey: qk.calendario.all })
    .filter(([key]) => key[1] === "range");
}

/** The task of a cached range, with the status the mutation sets. Hides it under "Ocultar completadas". */
function patchRange(range: CalendarioRange, vars: CompleteVars, hideCompleted: boolean): CalendarioRange {
  const closing = vars.status === "completado";
  const items: CalItem[] = [];
  for (const item of range.items) {
    if (item.kind !== "task" || item.taskId !== vars.taskId) {
      items.push(item);
      continue;
    }
    if (closing && hideCompleted) continue;
    items.push({
      ...item,
      status: vars.status,
      statusLabel: closing ? COMPLETED_LABEL : vars.previous.statusLabel,
      completed: closing,
      overdue: closing ? false : vars.previous.overdue,
    });
  }
  return { ...range, items };
}

/**
 * One-tap complete of a task from the agenda (FE §4.2): `setTaskStatusAction`
 * through `useActionMutation`, optimistic on every cached range (rolled back on
 * error), toast "Tarea completada." with Deshacer, which sets the previous status back.
 */
export function useCompleteCalendarioTask(items: readonly CalItem[], hideCompleted: boolean): (taskId: string) => void {
  const mutation = useActionMutation<CompleteVars, unknown, RangeSnapshot>(
    (vars) => setTaskStatusAction(vars.taskId, vars.status),
    {
      optimistic: {
        onMutate: async (client, vars) => {
          await client.cancelQueries({ queryKey: qk.calendario.all });
          const snapshot: RangeSnapshot = rangeEntries(client).map(([key, data]) => [key, data]);
          for (const [key, data] of snapshot) {
            if (data) client.setQueryData(key, patchRange(data, vars, hideCompleted && vars.status === "completado"));
          }
          return snapshot;
        },
        rollback: (client, snapshot) => {
          for (const [key, data] of snapshot) client.setQueryData(key, data);
        },
      },
      invalidate: (vars) => [...taskStatusInvalidations(vars.previous.project?.id ?? "sin-proyecto"), qk.calendario.all],
      errorContext: "calendario",
    },
  );
  const { mutateAsync } = mutation;

  return useCallback(
    (taskId: string) => {
      const previous = items.find((item): item is CalTaskItem => item.kind === "task" && item.taskId === taskId);
      if (!previous || previous.completed) return;
      void mutateAsync({ taskId, status: "completado", previous }).then(
        () => {
          toast(TASK_COMPLETED_TOAST, {
            action: {
              label: UNDO_LABEL,
              onClick: () => void mutateAsync({ taskId, status: previous.status, previous }).catch(() => undefined),
            },
          });
        },
        () => undefined,
      );
    },
    [items, mutateAsync],
  );
}
