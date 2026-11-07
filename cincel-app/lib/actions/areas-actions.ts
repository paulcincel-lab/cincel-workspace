"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolvePositionsCapabilities } from "@/lib/auth/permissions";
import * as areasRepository from "@/lib/repositories/areas-repository";
import { googleManagedStaffIds } from "@/lib/repositories/staff-repository";
import type { Area, AreaDetail, AreaInput } from "@/lib/types/core";
import { GOOGLE_MANAGED_REFUSAL, type GoogleManagedRefusal } from "@/lib/types/workspace-access";

async function requirePositionsCapabilities() {
  return resolvePositionsCapabilities(await requireCapabilityUser());
}

export async function fetchAreasAction(options: { includeInactive?: boolean } = {}): Promise<AreaDetail[]> {
  const caps = await requirePositionsCapabilities();
  if (!caps.canViewPositions) return [];
  return areasRepository.listAreas(options);
}

export async function fetchAreaAction(id: string): Promise<AreaDetail | null> {
  const caps = await requirePositionsCapabilities();
  if (!caps.canViewPositions) return null;
  return areasRepository.getArea(id);
}

export async function createAreaAction(input: AreaInput): Promise<Area> {
  const user = await requireCapabilityUser();
  if (!resolvePositionsCapabilities(user).canManagePositions) {
    throw new Error("FORBIDDEN: areas create");
  }
  const row = await areasRepository.createArea(input, user.member.id);
  revalidatePath("/configuracion/areas");
  return row;
}

export async function updateAreaAction(id: string, patch: Partial<AreaInput>): Promise<Area> {
  const user = await requireCapabilityUser();
  if (!resolvePositionsCapabilities(user).canManagePositions) {
    throw new Error("FORBIDDEN: areas edit");
  }
  const row = await areasRepository.updateArea(id, patch, user.member.id);
  revalidatePath("/configuracion/areas");
  return row;
}

export async function deleteAreaAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolvePositionsCapabilities(user).canManagePositions) {
    throw new Error("FORBIDDEN: areas delete");
  }
  await areasRepository.softDeleteArea(id, user.member.id);
  revalidatePath("/configuracion/areas");
}

export async function setAreaMembersAction(
  areaId: string,
  members: Array<{ staffId: string; role?: string | null }>
): Promise<GoogleManagedRefusal | void> {
  const user = await requireCapabilityUser();
  if (!resolvePositionsCapabilities(user).canManagePositions) {
    throw new Error("FORBIDDEN: areas members edit");
  }
  // Google-managed staff get their áreas from Workspace (BE §A.7): adding or
  // removing one of them is refused (returned, so the client sees the message);
  // their área role stays editable.
  const current = new Set(await areasRepository.listAreaMemberIds(areaId));
  const wanted = new Set(members.map((member) => member.staffId));
  const changed = [
    ...[...wanted].filter((id) => !current.has(id)),
    ...[...current].filter((id) => !wanted.has(id)),
  ];
  if ((await googleManagedStaffIds(changed)).size > 0) return GOOGLE_MANAGED_REFUSAL;
  await areasRepository.setAreaMembers(areaId, members);
  revalidatePath("/configuracion/areas");
}

export async function setAreaWorkflowsAction(areaId: string, workflowIds: string[]): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolvePositionsCapabilities(user).canManagePositions) {
    throw new Error("FORBIDDEN: areas workflows edit");
  }
  await areasRepository.setAreaWorkflows(areaId, workflowIds);
  revalidatePath("/configuracion/areas");
}
