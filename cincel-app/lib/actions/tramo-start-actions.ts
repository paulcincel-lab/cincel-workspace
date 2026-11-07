"use server";

/**
 * Starting a tramo (project flow BE §7.4, FE §7.5). Reads need
 * `activities.canViewActivities`; start and undo need `canCreateActivity`
 * (and admin for `autoStart`). Mutations revalidate the `/actividades`
 * layout, `/proyectos`, the ficha, `/dashboard`, `/tablero`, `/mis-tareas`
 * and `/calendario`.
 */
import { notImplemented } from "@/lib/project-flow/not-implemented";
import type { StartTramoInput, StartTramoPreview, StartTramoResult, TramoBoard } from "@/lib/types/core";

/** Listos para iniciar, Próximos and started projects of one tramo. Errors: NOT_FOUND. */
export async function fetchTramoBoardAction(workflowId: string): Promise<TramoBoard> {
  return notImplemented("fetchTramoBoardAction", workflowId);
}

/** The sheet's fases, templates still to create and candidates. Errors: FORBIDDEN, NOT_FOUND. */
export async function previewStartTramoAction(projectId: string, workflowId: string): Promise<StartTramoPreview> {
  return notImplemented("previewStartTramoAction", projectId, workflowId);
}

/**
 * Idempotent: templates already on the project are skipped (`skippedCount`).
 * Errors: FORBIDDEN, NOT_FOUND, PHASE_MISMATCH, NO_PHASES, INVALID.
 */
export async function startTramoAction(input: StartTramoInput): Promise<StartTramoResult> {
  return notImplemented("startTramoAction", input);
}

/** Only the latest untouched batch of the tramo. Errors: FORBIDDEN, NOT_FOUND, TOUCHED. */
export async function undoStartTramoAction(batchId: string): Promise<void> {
  return notImplemented("undoStartTramoAction", batchId);
}
