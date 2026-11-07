"use server";

/**
 * Puestos (project flow BE §7.2). Reads: any staff session. Writes:
 * `positions.canManagePositions` (today `areas.canManageAreas`). Revalidates
 * `/configuracion/puestos` and `/equipo` (+ `/configuracion/google` on delete).
 */
import { revalidatePath } from "next/cache";

import { resolveAreasCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { FLOW_ERROR, flowError } from "@/lib/project-flow/errors";
import * as positionsRepository from "@/lib/repositories/positions-repository";
import type { Position, PositionInput } from "@/lib/types/core";
import {
  OrderedIdsSchema,
  PositionInputSchema,
  UuidArraySchema,
  UuidSchema,
  parseInput,
} from "@/lib/validation/project-flow";

/** The company-structure managers (Administrador / Dirección by default); FORBIDDEN otherwise. */
async function requirePositionsManager() {
  const user = await requireCapabilityUser();
  if (!resolveAreasCapabilities(user).canManageAreas) throw flowError(FLOW_ERROR.FORBIDDEN);
  return user;
}

function revalidatePositions(options: { google?: boolean } = {}) {
  revalidatePath("/configuracion/puestos");
  revalidatePath("/equipo");
  if (options.google) revalidatePath("/configuracion/google");
}

/** Live puestos by `sortOrder` (active and inactive), with phases, staffCount and googleManaged. */
export async function fetchPositionsAction(): Promise<Position[]> {
  await requireCapabilityUser();
  return positionsRepository.listPositions();
}

/** Errors: FORBIDDEN, NAME_TAKEN, EMPTY. */
export async function createPositionAction(input: PositionInput): Promise<Position> {
  await requirePositionsManager();
  const values = parseInput(PositionInputSchema, input);
  const row = await positionsRepository.createPosition(values);
  revalidatePositions();
  return row;
}

/** Errors: FORBIDDEN, NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function updatePositionAction(id: string, patch: Partial<PositionInput>): Promise<Position> {
  await requirePositionsManager();
  const positionId = parseInput(UuidSchema, id);
  const values = parseInput(PositionInputSchema.partial(), patch);
  const row = await positionsRepository.updatePosition(positionId, values);
  revalidatePositions();
  return row;
}

/** Errors: FORBIDDEN, NOT_FOUND, IN_USE (a Google group mapping references it). */
export async function deletePositionAction(id: string): Promise<void> {
  await requirePositionsManager();
  const positionId = parseInput(UuidSchema, id);
  await positionsRepository.softDeletePosition(positionId);
  revalidatePositions({ google: true });
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
  const ids = parseInput(OrderedIdsSchema, orderedIds);
  await positionsRepository.reorderPositions(ids);
  revalidatePositions();
}
