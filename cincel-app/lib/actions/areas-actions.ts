"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { isAdministratorRole } from "@/lib/data/roles";
import * as areasRepository from "@/lib/repositories/areas-repository";
import type { Area, AreaDetail, AreaInput } from "@/lib/types/core";

/** Areas are an admin surface: only Administrador manages them (Phase 3). */
async function requireAdmin() {
  const user = await requireCapabilityUser();
  if (!isAdministratorRole(user.member.role) && user.access !== "Dirección") {
    throw new Error("FORBIDDEN: areas admin");
  }
  return user;
}

export async function fetchAreasAction(options: { includeInactive?: boolean } = {}): Promise<AreaDetail[]> {
  await requireCapabilityUser();
  return areasRepository.listAreas(options);
}

export async function fetchAreaAction(id: string): Promise<AreaDetail | null> {
  await requireCapabilityUser();
  return areasRepository.getArea(id);
}

export async function createAreaAction(input: AreaInput): Promise<Area> {
  const user = await requireAdmin();
  const row = await areasRepository.createArea(input, user.member.id);
  revalidatePath("/configuracion/areas");
  return row;
}

export async function updateAreaAction(id: string, patch: Partial<AreaInput>): Promise<Area> {
  const user = await requireAdmin();
  const row = await areasRepository.updateArea(id, patch, user.member.id);
  revalidatePath("/configuracion/areas");
  return row;
}

export async function deleteAreaAction(id: string): Promise<void> {
  const user = await requireAdmin();
  await areasRepository.softDeleteArea(id, user.member.id);
  revalidatePath("/configuracion/areas");
}

export async function setAreaMembersAction(
  areaId: string,
  members: Array<{ staffId: string; role?: string | null }>
): Promise<void> {
  await requireAdmin();
  await areasRepository.setAreaMembers(areaId, members);
  revalidatePath("/configuracion/areas");
}

export async function setAreaWorkflowsAction(areaId: string, workflowIds: string[]): Promise<void> {
  await requireAdmin();
  await areasRepository.setAreaWorkflows(areaId, workflowIds);
  revalidatePath("/configuracion/areas");
}
