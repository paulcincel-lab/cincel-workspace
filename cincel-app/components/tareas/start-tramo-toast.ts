"use client";

import { toast } from "sonner";

import { undoStartTramoAction } from "@/lib/actions/tramo-start-actions";
import { useActionMutation } from "@/lib/query/mutation";
import { tramoStartInvalidations } from "@/lib/query/options/tareas";
import type { StartTramoResult } from "@/lib/types/core";

/** The toast's undo window (brief: "Deshacer" for 10 s). */
export const START_TRAMO_UNDO_MS = 10_000;

/** What "Deshacer" sends: the batch, and the project and tramo whose caches it invalidates. */
export type UndoStartTramoVars = { batchId: string; projectId: string; workflowId: string };

const undoStartTramo = (vars: UndoStartTramoVars) => undoStartTramoAction(vars.batchId);

/**
 * "Deshacer" of the start toast as a mutation: the same invalidations as the
 * start (`tramoStartInvalidations`), on success and on failure (a TOUCHED or
 * NOT_FOUND batch means the screen is stale). Success and error copy are
 * toasts; the callbacks live on the hook, so they still run when the toast
 * is clicked after the slot unmounted.
 */
export function useUndoStartTramo(tramoName: string) {
  return useActionMutation<UndoStartTramoVars, void>(undoStartTramo, {
    invalidate: (vars) => tramoStartInvalidations(vars),
    errorContext: { tramoName },
    successToast: `Se deshizo el inicio de ${tramoName}.`,
  });
}

export type NotifyTramoStartedOptions = {
  /** Undoes the batch (`useUndoStartTramo().mutate`). */
  undo: (vars: UndoStartTramoVars) => void;
};

/**
 * The confirmation toast after "Crear N tareas" (FE §4.3). With created tasks it
 * carries "Deshacer" for 10 s; afterwards undo lives on the project block.
 */
export function notifyTramoStarted(result: StartTramoResult, { undo }: NotifyTramoStartedOptions): void {
  const tramo = result.workflow.name;
  const project = result.project.name;
  const batchId = result.batchId;
  if (result.createdCount === 0 || !batchId) {
    toast(`${tramo} iniciado en ${project}.`);
    return;
  }
  toast(`Se crearon ${result.createdCount} tareas de ${tramo} en ${project}.`, {
    duration: START_TRAMO_UNDO_MS,
    action: {
      label: "Deshacer",
      onClick: () => undo({ batchId, projectId: result.project.id, workflowId: result.workflow.id }),
    },
  });
}
