import type { StartTramoAssignment, StartTramoPreview, StartTramoResult } from "@/lib/types/core";

import type { TramoStartTrigger } from "./catalog";
import type { FlowExecutor, FlowTx } from "./db";
import { notImplemented } from "./not-implemented";

/** Input of `startTramo` (BE §9.6). */
export type StartTramoParams = {
  projectId: string;
  workflowId: string;
  /** Checked fases; empty → NO_PHASES unless `stageOnly`. */
  phaseIds: string[];
  assignment: StartTramoAssignment;
  actorId: string;
  trigger: TramoStartTrigger;
  /** Admin, manual trigger only: also sets the firm-wide auto-start in the same transaction. */
  autoStart?: boolean;
  /** Internal (admin "Asignar tramo"): open the stage and set it current, no fases or tasks. */
  stageOnly?: boolean;
};

/**
 * The "Iniciar tramo" sheet's data (BE §9.3): per active fase, the templates
 * still to create, the count already created, and the candidates.
 */
export async function previewStartTramo(
  db: FlowExecutor,
  projectId: string,
  workflowId: string
): Promise<StartTramoPreview> {
  return notImplemented("previewStartTramo", db, projectId, workflowId);
}

/**
 * Starts (or extends) a tramo on a project, idempotently, inside the given
 * transaction (BE §9.6). Locks the project row first. Errors: NOT_FOUND,
 * NO_PHASES, PHASE_MISMATCH.
 */
export async function startTramo(tx: FlowTx, params: StartTramoParams): Promise<StartTramoResult> {
  return notImplemented("startTramo", tx, params);
}

/**
 * Undoes a start batch (BE §9.7): soft-deletes its tasks, removes the stage
 * it opened when nothing else of the tramo remains, restores the current
 * tramo. Errors: NOT_FOUND, TOUCHED.
 */
export async function undoStartTramo(tx: FlowTx, batchId: string, actorId: string): Promise<void> {
  return notImplemented("undoStartTramo", tx, batchId, actorId);
}

/** True when any task of the batch was edited, deleted, commented, or got related rows (BE §9.7). */
export async function isBatchTouched(db: FlowExecutor, batchId: string): Promise<boolean> {
  return notImplemented("isBatchTouched", db, batchId);
}
