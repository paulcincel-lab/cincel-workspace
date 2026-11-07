"use server";

/**
 * Puestos (project flow BE §7.2). Reads: any staff session. Writes:
 * `positions.canManagePositions` (today `areas.canManageAreas`). Revalidates
 * `/configuracion/puestos` and `/equipo` (+ `/configuracion/google` on delete).
 */
import { notImplemented } from "@/lib/project-flow/not-implemented";
import type { Position, PositionInput } from "@/lib/types/core";

/** Live puestos by `sortOrder` (active and inactive), with phases, staffCount and googleManaged. */
export async function fetchPositionsAction(): Promise<Position[]> {
  return notImplemented("fetchPositionsAction");
}

/** Errors: FORBIDDEN, NAME_TAKEN, EMPTY. */
export async function createPositionAction(input: PositionInput): Promise<Position> {
  return notImplemented("createPositionAction", input);
}

/** Errors: FORBIDDEN, NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function updatePositionAction(id: string, patch: Partial<PositionInput>): Promise<Position> {
  return notImplemented("updatePositionAction", id, patch);
}

/** Errors: FORBIDDEN, NOT_FOUND, IN_USE (a Google group mapping references it). */
export async function deletePositionAction(id: string): Promise<void> {
  return notImplemented("deletePositionAction", id);
}

/** Replaces the candidate fases (any tramo). Errors: FORBIDDEN, NOT_FOUND (unknown ids). */
export async function setPositionPhasesAction(id: string, phaseIds: string[]): Promise<Position> {
  return notImplemented("setPositionPhasesAction", id, phaseIds);
}

/** Errors: FORBIDDEN. */
export async function reorderPositionsAction(orderedIds: string[]): Promise<void> {
  return notImplemented("reorderPositionsAction", orderedIds);
}
