"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveAreasCapabilities } from "@/lib/auth/permissions";
import * as areasRepository from "@/lib/repositories/areas-repository";
import type { Area, AreaDetail, AreaInput } from "@/lib/types/core";

async function requireAreasCapabilities() {
  return resolveAreasCapabilities(await requireCapabilityUser());
}

export async function fetchAreasAction(options: { includeInactive?: boolean } = {}): Promise<AreaDetail[]> {
  const caps = await requireAreasCapabilities();
  if (!caps.canViewAreas) return [];
  return areasRepository.listAreas(options);
}

export async function fetchAreaAction(id: string): Promise<AreaDetail | null> {
  const caps = await requireAreasCapabilities();
  if (!caps.canViewAreas) return null;
  return areasRepository.getArea(id);
}

export async function createAreaAction(input: AreaInput): Promise<Area> {
  const user = await requireCapabilityUser();
  if (!resolveAreasCapabilities(user).canManageAreas) {
    throw new Error("FORBIDDEN: areas create");
  }
  const row = await areasRepository.createArea(input, user.member.id);
  revalidatePath("/configuracion/areas");
  return row;
}

export async function updateAreaAction(id: string, patch: Partial<AreaInput>): Promise<Area> {
  const user = await requireCapabilityUser();
  if (!resolveAreasCapabilities(user).canManageAreas) {
    throw new Error("FORBIDDEN: areas edit");
  }
  const row = await areasRepository.updateArea(id, patch, user.member.id);
  revalidatePath("/configuracion/areas");
  return row;
}

export async function deleteAreaAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveAreasCapabilities(user).canManageAreas) {
    throw new Error("FORBIDDEN: areas delete");
  }
  await areasRepository.softDeleteArea(id, user.member.id);
  revalidatePath("/configuracion/areas");
}

export async function setAreaMembersAction(
  areaId: string,
  members: Array<{ staffId: string; role?: string | null }>
): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveAreasCapabilities(user).canManageAreas) {
    throw new Error("FORBIDDEN: areas members edit");
  }
  await areasRepository.setAreaMembers(areaId, members);
  revalidatePath("/configuracion/areas");
}

export async function setAreaWorkflowsAction(areaId: string, workflowIds: string[]): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveAreasCapabilities(user).canManageAreas) {
    throw new Error("FORBIDDEN: areas workflows edit");
  }
  await areasRepository.setAreaWorkflows(areaId, workflowIds);
  revalidatePath("/configuracion/areas");
}
