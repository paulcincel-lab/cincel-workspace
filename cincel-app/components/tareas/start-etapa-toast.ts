"use client";

import { toast } from "sonner";

import { undoStartEtapaAction } from "@/lib/actions/etapa-start-actions";
import { useActionMutation } from "@/lib/query/mutation";
import { etapaStartInvalidations } from "@/lib/query/options/tareas";
import type { StartEtapaResult } from "@/lib/types/core";

/** The toast's undo window (brief: "Deshacer" for 10 s). */
export const START_ETAPA_UNDO_MS = 10_000;

/** What "Deshacer" sends: the batch, and the project and etapa whose caches it invalidates. */
export type UndoStartEtapaVars = { batchId: string; projectId: string; workflowId: string };

const undoStartEtapa = (vars: UndoStartEtapaVars) => undoStartEtapaAction(vars.batchId);

/**
 * "Deshacer" of the start toast as a mutation: the same invalidations as the
 * start (`etapaStartInvalidations`), on success and on failure (a TOUCHED or
 * NOT_FOUND batch means the screen is stale). Success and error copy are
 * toasts; the callbacks live on the hook, so they still run when the toast
 * is clicked after the slot unmounted.
 */
export function useUndoStartEtapa(etapaName: string) {
  return useActionMutation<UndoStartEtapaVars, void>(undoStartEtapa, {
    invalidate: (vars) => etapaStartInvalidations(vars),
    errorContext: { etapaName },
    successToast: `Se deshizo el inicio de ${etapaName}.`,
  });
}

export type NotifyEtapaStartedOptions = {
  /** Undoes the batch (`useUndoStartEtapa().mutate`). */
  undo: (vars: UndoStartEtapaVars) => void;
};

/**
 * The confirmation toast after "Crear N tareas" (FE §4.3). With created tasks it
 * carries "Deshacer" for 10 s; afterwards undo lives on the project block.
 */
export function notifyEtapaStarted(result: StartEtapaResult, { undo }: NotifyEtapaStartedOptions): void {
  const etapa = result.workflow.name;
  const project = result.project.name;
  const batchId = result.batchId;
  if (result.createdCount === 0 || !batchId) {
    toast(`${etapa} iniciado en ${project}.`);
    return;
  }
  toast(`Se crearon ${result.createdCount} tareas de ${etapa} en ${project}.`, {
    duration: START_ETAPA_UNDO_MS,
    action: {
      label: "Deshacer",
      onClick: () => undo({ batchId, projectId: result.project.id, workflowId: result.workflow.id }),
    },
  });
}
