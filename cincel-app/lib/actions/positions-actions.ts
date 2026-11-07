"use server";

/**
 * Puestos (project flow BE §7.2). Reads: any staff session. Writes:
 * `positions.canManagePositions`. Revalidates
 * `/configuracion/puestos` and `/equipo` (+ `/configuracion/google` on delete).
 */
import { revalidatePath } from "next/cache";

import { resolvePositionsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { flowError } from "@/lib/project-flow/errors";
import * as positionsRepository from "@/lib/repositories/positions-repository";
import type { Position, PositionInput } from "@/lib/types/core";
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

function revalidatePositions(): void {
  revalidatePath("/configuracion/puestos");
  revalidatePath("/equipo");
}

/** Live puestos by `sortOrder` (active and inactive), with phases, staffCount and googleManaged. */
export async function fetchPositionsAction(): Promise<Position[]> {
  await requireCapabilityUser();
  return positionsRepository.listPositions();
}

/** Errors: FORBIDDEN, NAME_TAKEN, EMPTY. */
export async function createPositionAction(input: PositionInput): Promise<Position> {
  await requirePositionsManager();
  const parsed = parseInput(PositionInputSchema, input);
  const row = await positionsRepository.createPosition(parsed);
  revalidatePositions();
  return row;
}

/** Errors: FORBIDDEN, NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function updatePositionAction(id: string, patch: Partial<PositionInput>): Promise<Position> {
  await requirePositionsManager();
  const positionId = parseInput(UuidSchema, id);
  const parsed = parseInput(PositionInputSchema.partial(), patch);
  const row = await positionsRepository.updatePosition(positionId, parsed);
  revalidatePositions();
  return row;
}

/** Errors: FORBIDDEN, NOT_FOUND, IN_USE (a Google group mapping references it). */
export async function deletePositionAction(id: string): Promise<void> {
  await requirePositionsManager();
  await positionsRepository.softDeletePosition(parseInput(UuidSchema, id));
  revalidatePositions();
  revalidatePath("/configuracion/google");
}

/** Replaces the candidate fases (any tramo). Errors: FORBIDDEN, NOT_FOUND (unknown ids). */
export async function setPositionPhasesAction(id: string, phaseIds: string[]): Promise<Position> {
  await requirePositionsManager();
  const positionId = parseInput(UuidSchema, id);
  const ids = parseInput(UuidArraySchema, phaseIds);
  const row = await positionsRepository.setPositionPhases(positionId, [...new Set(ids)]);
  revalidatePositions();
  return row;
}

/** Errors: FORBIDDEN. */
export async function reorderPositionsAction(orderedIds: string[]): Promise<void> {
  await requirePositionsManager();
  await positionsRepository.reorderPositions(parseInput(OrderedIdsSchema, orderedIds));
  revalidatePositions();
}
