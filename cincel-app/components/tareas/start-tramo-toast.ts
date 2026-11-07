import { toast } from "sonner";

import { undoStartTramoAction } from "@/lib/actions/tramo-start-actions";
import type { StartTramoResult } from "@/lib/types/core";

import { actionErrorCode, actionErrorText } from "@/lib/errors";

/** The toast's undo window (brief: "Deshacer" for 10 s). */
export const START_TRAMO_UNDO_MS = 10_000;

export type NotifyTramoStartedOptions = {
  /** Refetch tasks and the tramo board (FE §6). */
  refresh: () => void | Promise<void>;
};

/** Undo a start batch from the toast, then report the outcome as a toast. */
export async function undoStartTramoFromToast(
  batchId: string,
  tramoName: string,
  refresh: NotifyTramoStartedOptions["refresh"],
): Promise<void> {
  try {
    await undoStartTramoAction(batchId);
    toast(`Se deshizo el inicio de ${tramoName}.`);
  } catch (err) {
    if (actionErrorCode(err) === "TOUCHED") {
      toast("No se puede deshacer: ya se editó una de las tareas creadas.");
    } else {
      toast(actionErrorText(err, { tramoName }));
    }
  }
  await refresh();
}

/**
 * The confirmation toast after "Crear N tareas" (FE §4.3). With created tasks it
 * carries "Deshacer" for 10 s; afterwards undo lives on the project block.
 */
export function notifyTramoStarted(result: StartTramoResult, { refresh }: NotifyTramoStartedOptions): void {
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
      onClick: () => {
        void undoStartTramoFromToast(batchId, tramo, refresh);
      },
    },
  });
}
