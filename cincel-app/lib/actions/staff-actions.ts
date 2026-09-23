"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { canViewSensitiveStaffData, resolveTeamCapabilities } from "@/lib/auth/permissions";
import * as staffRepository from "@/lib/repositories/staff-repository";
import type { EmergencyContact, Staff, StaffDetail, StaffInput, StaffProfile } from "@/lib/types/core";

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

export async function updateStaffAction(id: string, patch: Partial<StaffInput>): Promise<Staff> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canEditCollaborator) {
    throw new Error("FORBIDDEN: staff edit");
  }
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

export async function setStaffAreasAction(staffId: string, areaIds: string[]): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canEditCollaborator) {
    throw new Error("FORBIDDEN: staff areas edit");
  }
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
