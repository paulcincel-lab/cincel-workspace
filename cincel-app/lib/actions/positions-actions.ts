"use server";

/**
 * Puestos (project flow BE §7.2). Reads: any staff session. Writes:
 * `positions.canManagePositions`, returning `ActionResult`. Ajustes › Puestos
 * and Personas read through TanStack Query: the caller invalidates
 * `ajustes.page('puestos')`, `personas.equipo` and `catalog.assignableStaff`.
 * Ajustes › Google reads through TanStack Query too (`ajustes.page('google')`).
 */
import { toActionResult } from "@/lib/actions/action-result";
import { resolvePositionsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { flowError } from "@/lib/project-flow/errors";
import * as positionsRepository from "@/lib/repositories/positions-repository";
import type { Position, PositionInput } from "@/lib/types/core";
import type { ActionResult } from "@/lib/types/schedule";
import {
  OrderedIdsSchema,
  parseInput,
  PositionInputSchema,
  UuidArraySchema,
  UuidSchema,
} from "@/lib/validation/project-flow";

/** The puestos write guard: `positions.canManagePositions`. */
async function requirePositionsManager(): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolvePositionsCapabilities(user).canManagePositions) throw flowError("FORBIDDEN");
}

/** Live puestos by `sortOrder` (active and inactive), with phases, staffCount and googleManaged. */
export async function fetchPositionsAction(): Promise<Position[]> {
  await requireCapabilityUser();
  return positionsRepository.listPositions();
}

/** Errors: FORBIDDEN, NAME_TAKEN, EMPTY. */
export async function createPositionAction(
  ...args: Parameters<typeof createPositionActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createPositionActionImpl>>>> {
  return toActionResult(() => createPositionActionImpl(...args));
}

async function createPositionActionImpl(input: PositionInput): Promise<Position> {
  await requirePositionsManager();
  const parsed = parseInput(PositionInputSchema, input);
  return positionsRepository.createPosition(parsed);
}

/** Errors: FORBIDDEN, NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function updatePositionAction(
  ...args: Parameters<typeof updatePositionActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updatePositionActionImpl>>>> {
  return toActionResult(() => updatePositionActionImpl(...args));
}

async function updatePositionActionImpl(id: string, patch: Partial<PositionInput>): Promise<Position> {
  await requirePositionsManager();
  const positionId = parseInput(UuidSchema, id);
  const parsed = parseInput(PositionInputSchema.partial(), patch);
  return positionsRepository.updatePosition(positionId, parsed);
}

/** Errors: FORBIDDEN, NOT_FOUND, IN_USE (a Google group mapping references it). */
export async function deletePositionAction(
  ...args: Parameters<typeof deletePositionActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deletePositionActionImpl>>>> {
  return toActionResult(() => deletePositionActionImpl(...args));
}

async function deletePositionActionImpl(id: string): Promise<void> {
  await requirePositionsManager();
  await positionsRepository.softDeletePosition(parseInput(UuidSchema, id));
}

/** Replaces the candidate fases (any tramo). Errors: FORBIDDEN, NOT_FOUND (unknown ids). */
export async function setPositionPhasesAction(
  ...args: Parameters<typeof setPositionPhasesActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setPositionPhasesActionImpl>>>> {
  return toActionResult(() => setPositionPhasesActionImpl(...args));
}

async function setPositionPhasesActionImpl(id: string, phaseIds: string[]): Promise<Position> {
  await requirePositionsManager();
  const positionId = parseInput(UuidSchema, id);
  const ids = parseInput(UuidArraySchema, phaseIds);
  return positionsRepository.setPositionPhases(positionId, [...new Set(ids)]);
}

/** Errors: FORBIDDEN, INVALID. */
export async function reorderPositionsAction(
  ...args: Parameters<typeof reorderPositionsActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof reorderPositionsActionImpl>>>> {
  return toActionResult(() => reorderPositionsActionImpl(...args));
}

async function reorderPositionsActionImpl(orderedIds: string[]): Promise<void> {
  await requirePositionsManager();
  await positionsRepository.reorderPositions(parseInput(OrderedIdsSchema, orderedIds));
}
