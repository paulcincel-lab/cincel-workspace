"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import {
  canViewSensitiveStaffData,
  resolveAreasCapabilities,
  resolveTeamCapabilities,
} from "@/lib/auth/permissions";
import { FLOW_ERROR, flowError } from "@/lib/project-flow/errors";
import * as positionsRepository from "@/lib/repositories/positions-repository";
import * as staffRepository from "@/lib/repositories/staff-repository";
import type { EmergencyContact, Staff, StaffDetail, StaffInput, StaffProfile } from "@/lib/types/core";
import { GOOGLE_MANAGED_REFUSAL, type GoogleManagedRefusal } from "@/lib/types/workspace-access";
import { UuidArraySchema, UuidSchema, parseInput } from "@/lib/validation/project-flow";

const normalizeRole = (role: string | null | undefined) => role?.trim() || null;

/**
 * Role and áreas of Google-managed staff come from Workspace (BE §A.7): a
 * change is refused even when the action is called directly. Sending the
 * current value back (a full form save) is not a change. The refusal is
 * returned, not thrown, so the client can show its message.
 */
async function isRoleLocked(staffId: string, patch: Partial<StaffInput>): Promise<boolean> {
  if (patch.role === undefined) return false;
  const lock = await staffRepository.getStaffRoleLock(staffId);
  return Boolean(lock?.googleManaged && normalizeRole(patch.role) !== normalizeRole(lock.role));
}

async function areAreasLocked(staffId: string, areaIds: string[]): Promise<boolean> {
  if (!(await staffRepository.googleManagedStaffIds([staffId])).has(staffId)) return false;
  const current = new Set(await staffRepository.listStaffAreaIds(staffId));
  const wanted = new Set(areaIds);
  return current.size !== wanted.size || [...wanted].some((id) => !current.has(id));
}

/**
 * Everyone's emergency contact, for quick access in Equipo (#451). `null`
 * when the caller may not see staff PII — see canViewSensitiveStaffData.
 */
export async function fetchEmergencyContactsAction(): Promise<Record<string, EmergencyContact> | null> {
  const user = await requireCapabilityUser();
  if (!canViewSensitiveStaffData(user)) return null;
  return staffRepository.listEmergencyContacts();
}

async function requireTeamCapabilities() {
  return resolveTeamCapabilities(await requireCapabilityUser());
}

export async function fetchStaffAction(options: { includeInactive?: boolean } = {}): Promise<Staff[]> {
  const caps = await requireTeamCapabilities();
  if (!caps.canViewTeam) return [];
  return staffRepository.listStaff(options);
}

export async function fetchAssignableStaffAction(
  workflowId?: string | null
): Promise<Array<Staff & { suggested: boolean }>> {
  await requireCapabilityUser();
  return staffRepository.listAssignableStaff({ workflowId });
}

export async function fetchStaffDetailAction(id: string): Promise<StaffDetail | null> {
  const caps = await requireTeamCapabilities();
  if (!caps.canViewTeam) return null;
  return staffRepository.getStaff(id);
}

export async function createStaffAction(input: StaffInput): Promise<Staff> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canCreateCollaborator) {
    throw new Error("FORBIDDEN: staff create");
  }
  const row = await staffRepository.createStaff(input, user.member.id);
  revalidatePath("/equipo");
  return row;
}

export async function updateStaffAction(
  id: string,
  patch: Partial<StaffInput>
): Promise<Staff | GoogleManagedRefusal> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canEditCollaborator) {
    throw new Error("FORBIDDEN: staff edit");
  }
  if (await isRoleLocked(id, patch)) return GOOGLE_MANAGED_REFUSAL;
  const row = await staffRepository.updateStaff(id, patch, user.member.id);
  revalidatePath("/equipo");
  return row;
}

export async function setStaffActiveAction(id: string, active: boolean): Promise<Staff> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canToggleCollaboratorActive) {
    throw new Error("FORBIDDEN: staff toggle active");
  }
  const row = await staffRepository.setStaffActive(id, active, user.member.id);
  revalidatePath("/equipo");
  return row;
}

export async function deleteStaffAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canDeleteCollaborator) {
    throw new Error("FORBIDDEN: staff delete");
  }
  await staffRepository.softDeleteStaff(id, user.member.id);
  revalidatePath("/equipo");
}

export async function upsertStaffProfileAction(
  staffId: string,
  profile: Partial<StaffProfile>
): Promise<StaffProfile> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canEditCollaborator) {
    throw new Error("FORBIDDEN: staff profile edit");
  }
  const row = await staffRepository.upsertStaffProfile(staffId, profile);
  revalidatePath("/equipo");
  return row;
}

export async function setStaffAreasAction(staffId: string, areaIds: string[]): Promise<GoogleManagedRefusal | void> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canEditCollaborator) {
    throw new Error("FORBIDDEN: staff areas edit");
  }
  if (await areAreasLocked(staffId, areaIds)) return GOOGLE_MANAGED_REFUSAL;
  await staffRepository.setStaffAreas(staffId, areaIds);
  revalidatePath("/equipo");
}

export async function setStaffCredentialAction(
  staffId: string,
  options: { enableAccess: boolean; temporaryPassword?: string }
): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canChangeCollaboratorAccess) {
    throw new Error("FORBIDDEN: staff access");
  }
  await staffRepository.setStaffCredential(staffId, options);
  revalidatePath("/equipo");
}

/**
 * Manual team order (#452) — part of the company structure, so only those
 * who manage áreas (Administrador / Dirección) can change it.
 */
export async function reorderStaffAction(orderedIds: string[]): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveAreasCapabilities(user).canManageAreas) {
    throw new Error("FORBIDDEN: staff reorder");
  }
  await staffRepository.reorderStaff(orderedIds);
  revalidatePath("/equipo");
}

/**
 * Replaces setStaffAreasAction (project flow BE §7.2). `team.canEditCollaborator`.
 * Returns GOOGLE_MANAGED_REFUSAL for a Google-managed person when position
 * mappings exist and the set differs from the workspace rows. Otherwise only
 * the `manual` rows are replaced (puestos that come from Workspace stay).
 * Errors: FORBIDDEN, NOT_FOUND.
 */
export async function setStaffPositionsAction(
  staffId: string,
  positionIds: string[]
): Promise<GoogleManagedRefusal | void> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canEditCollaborator) throw flowError(FLOW_ERROR.FORBIDDEN);
  const id = parseInput(UuidSchema, staffId);
  const wanted = [...new Set(parseInput(UuidArraySchema, positionIds))];
  if (!(await staffRepository.staffExists(id))) throw flowError(FLOW_ERROR.NOT_FOUND, "staff");

  const workspace = new Set(await staffRepository.listStaffPositionIds(id, "workspace"));
  const googleManaged = (await staffRepository.googleManagedStaffIds([id])).has(id);
  if (googleManaged && (await staffRepository.hasPositionGroupMappings())) {
    const same = workspace.size === wanted.length && wanted.every((p) => workspace.has(p));
    return same ? undefined : GOOGLE_MANAGED_REFUSAL;
  }

  await positionsRepository.setStaffPositions(id, wanted.filter((p) => !workspace.has(p)));
  revalidatePath("/equipo");
  revalidatePath("/configuracion/puestos");
}
