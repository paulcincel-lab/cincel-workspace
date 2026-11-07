/**
 * Puestos: the firm's job positions, who holds them and their candidate fases
 * (project flow BE §8.4). Candidates are suggestions only.
 */
import type { FlowExecutor } from "@/lib/project-flow/db";
import { notImplemented } from "@/lib/project-flow/not-implemented";
import type { Position, PositionInput, StaffCandidate } from "@/lib/types/core";

/** Live puestos (active and inactive) by `sort_order`, with phases, staffCount and googleManaged. */
export async function listPositions(): Promise<Position[]> {
  return notImplemented("listPositions");
}

/** NAME_TAKEN, EMPTY. */
export async function createPosition(input: PositionInput): Promise<Position> {
  return notImplemented("createPosition", input);
}

/** NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function updatePosition(id: string, patch: Partial<PositionInput>): Promise<Position> {
  return notImplemented("updatePosition", id, patch);
}

/**
 * Soft-deletes the puesto and hard-deletes its staff_positions and
 * position_phases rows in one transaction. IN_USE while a Google mapping
 * references it; NOT_FOUND.
 */
export async function softDeletePosition(id: string): Promise<void> {
  return notImplemented("softDeletePosition", id);
}

/** Replaces the candidate fase set in one transaction. Unknown fase ids → NOT_FOUND. */
export async function setPositionPhases(id: string, phaseIds: string[]): Promise<Position> {
  return notImplemented("setPositionPhases", id, phaseIds);
}

export async function reorderPositions(orderedIds: string[]): Promise<void> {
  return notImplemented("reorderPositions", orderedIds);
}

/** Replaces the person's `source = 'manual'` rows only; `workspace` rows stay. */
export async function setStaffPositions(staffId: string, positionIds: string[]): Promise<void> {
  return notImplemented("setStaffPositions", staffId, positionIds);
}

/**
 * Per fase id: staff whose live, active puestos list it, sorted by open
 * tasks (as manager) ascending, then name. One grouped count query.
 */
export async function listCandidates(
  executor: FlowExecutor,
  phaseIds: string[]
): Promise<Map<string, StaffCandidate[]>> {
  return notImplemented("listCandidates", executor, phaseIds);
}

/** A live puesto with that id exists (group mapping validation). */
export async function positionExists(id: string): Promise<boolean> {
  return notImplemented("positionExists", id);
}
