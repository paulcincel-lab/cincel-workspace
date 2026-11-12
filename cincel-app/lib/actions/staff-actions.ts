"use server";

import { toActionResult } from "@/lib/actions/action-result";
import type { ActionResult } from "@/lib/types/schedule";
import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { MemberEditorInputSchema, type MemberEditorInput } from "@/lib/equipo/member-input";
import {
  canViewSensitiveStaffData,
  resolvePositionsCapabilities,
  resolveTeamCapabilities,
} from "@/lib/auth/permissions";
import type { FlowExecutor } from "@/lib/project-flow/db";
import { flowError } from "@/lib/project-flow/errors";
import * as positionsRepository from "@/lib/repositories/positions-repository";
import * as staffRepository from "@/lib/repositories/staff-repository";
import type { EmergencyContact, Staff, StaffDetail, StaffInput, StaffProfile } from "@/lib/types/core";
import {
  GOOGLE_MANAGED_ERROR,
  GOOGLE_MANAGED_REFUSAL,
  isGoogleManagedRefusal,
  type GoogleManagedRefusal,
} from "@/lib/types/workspace-access";
import { UuidArraySchema, UuidSchema, parseInput } from "@/lib/validation/project-flow";

const normalizeRole = (role: string | null | undefined) => role?.trim() || null;

/**
 * The role of Google-managed staff comes from Workspace (BE §A.7): a
 * change is refused even when the action is called directly. Sending the
 * current value back (a full form save) is not a change. The refusal is
 * returned, not thrown, so the client can show its message.
 */
async function isRoleLocked(
  staffId: string,
  patch: Partial<StaffInput>,
  executor: FlowExecutor = db
): Promise<boolean> {
  if (patch.role === undefined) return false;
  const lock = await staffRepository.getStaffRoleLock(staffId, executor);
  return Boolean(lock?.googleManaged && normalizeRole(patch.role) !== normalizeRole(lock.role));
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

/**
 * `toActionResult` for an action that can refuse a Google-managed person:
 * `GOOGLE_MANAGED_REFUSAL` is already `{ ok: false, error }`, so it is the
 * failed result itself (callers check `isGoogleManagedRefusal` first).
 */
async function refusalResult<T>(run: () => Promise<T | GoogleManagedRefusal>): Promise<ActionResult<T>> {
  const result = await toActionResult(run);
  if (result.ok && isGoogleManagedRefusal(result.data)) return result.data;
  return result as ActionResult<T>;
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

export async function createStaffAction(
  ...args: Parameters<typeof createStaffActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createStaffActionImpl>>>> {
  return toActionResult(() => createStaffActionImpl(...args));
}

async function createStaffActionImpl(input: StaffInput): Promise<Staff> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canCreateCollaborator) {
    throw new Error("FORBIDDEN: staff create");
  }
  const row = await staffRepository.createStaff(input, user.member.id);
  return row;
}

// ── Own profile (Ajustes › Perfil, redesign FE §3.8) ───────────────────────
// Everyone may change their own nombre, teléfono and firma de correo through
// the same actions Equipo uses; puesto, rol and correo stay with Equipo / Google.

const OWN_STAFF_FIELDS: ReadonlySet<string> = new Set(["name", "phone"]);
const OWN_NAME_MAX = 120;
const OWN_PHONE_MAX = 40;
const OWN_SIGNATURE_MAX = 2000;

function isOwnStaffPatch(patch: Partial<StaffInput>): boolean {
  const keys = Object.keys(patch ?? {});
  return keys.length > 0 && keys.every((key) => OWN_STAFF_FIELDS.has(key));
}

function assertOwnStaffPatch(patch: Partial<StaffInput>): void {
  if (patch.name !== undefined) {
    const name = typeof patch.name === "string" ? patch.name.trim() : "";
    if (!name || name.length > OWN_NAME_MAX) throw new Error("INVALID: name");
  }
  if (patch.phone !== undefined && patch.phone !== null) {
    if (typeof patch.phone !== "string" || patch.phone.trim().length > OWN_PHONE_MAX) {
      throw new Error("INVALID: phone");
    }
  }
}

function isOwnSignaturePatch(profile: Partial<StaffProfile>): boolean {
  const keys = Object.keys(profile ?? {});
  return keys.length === 1 && keys[0] === "emailSignature";
}

export async function updateStaffAction(
  ...args: Parameters<typeof updateStaffActionImpl>
): Promise<ActionResult<Staff>> {
  return refusalResult(() => updateStaffActionImpl(...args));
}

async function updateStaffActionImpl(
  id: string,
  patch: Partial<StaffInput>
): Promise<Staff | GoogleManagedRefusal> {
  const user = await requireCapabilityUser();
  const ownEdit = id === user.member.id && isOwnStaffPatch(patch);
  if (!ownEdit && !resolveTeamCapabilities(user).canEditCollaborator) {
    throw new Error("FORBIDDEN: staff edit");
  }
  if (ownEdit) assertOwnStaffPatch(patch);
  if (await isRoleLocked(id, patch)) return GOOGLE_MANAGED_REFUSAL;
  const row = await staffRepository.updateStaff(id, patch, user.member.id);
  // The name shows in the shell (avatar menu) on every page.
  if (ownEdit) revalidatePath("/", "layout");
  return row;
}

export async function setStaffActiveAction(
  ...args: Parameters<typeof setStaffActiveActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setStaffActiveActionImpl>>>> {
  return toActionResult(() => setStaffActiveActionImpl(...args));
}

async function setStaffActiveActionImpl(id: string, active: boolean): Promise<Staff> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canToggleCollaboratorActive) {
    throw new Error("FORBIDDEN: staff toggle active");
  }
  const row = await staffRepository.setStaffActive(id, active, user.member.id);
  return row;
}

export async function deleteStaffAction(
  ...args: Parameters<typeof deleteStaffActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deleteStaffActionImpl>>>> {
  return toActionResult(() => deleteStaffActionImpl(...args));
}

async function deleteStaffActionImpl(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canDeleteCollaborator) {
    throw new Error("FORBIDDEN: staff delete");
  }
  await staffRepository.softDeleteStaff(id, user.member.id);
}

export async function upsertStaffProfileAction(
  ...args: Parameters<typeof upsertStaffProfileActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof upsertStaffProfileActionImpl>>>> {
  return toActionResult(() => upsertStaffProfileActionImpl(...args));
}

async function upsertStaffProfileActionImpl(
  staffId: string,
  profile: Partial<StaffProfile>
): Promise<StaffProfile> {
  const user = await requireCapabilityUser();
  if (staffId === user.member.id && isOwnSignaturePatch(profile)) {
    const signature = profile.emailSignature;
    if (signature !== null && (typeof signature !== "string" || signature.length > OWN_SIGNATURE_MAX)) {
      throw new Error("INVALID: emailSignature");
    }
    // No revalidation: Ajustes › Perfil writes the result into `qk.ajustes.page('perfil')`.
    const row = await staffRepository.setStaffEmailSignature(staffId, signature ?? null);
    return row;
  }
  if (!resolveTeamCapabilities(user).canEditCollaborator) {
    throw new Error("FORBIDDEN: staff profile edit");
  }
  const row = await staffRepository.upsertStaffProfile(staffId, profile);
  return row;
}

export async function setStaffCredentialAction(
  ...args: Parameters<typeof setStaffCredentialActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setStaffCredentialActionImpl>>>> {
  return toActionResult(() => setStaffCredentialActionImpl(...args));
}

async function setStaffCredentialActionImpl(
  staffId: string,
  options: { enableAccess: boolean; temporaryPassword?: string }
): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canChangeCollaboratorAccess) {
    throw new Error("FORBIDDEN: staff access");
  }
  await staffRepository.setStaffCredential(staffId, options);
}

/**
 * Manual team order (#452) — part of the company structure, so only those
 * who manage puestos (Administrador / Dirección) can change it.
 */
export async function reorderStaffAction(
  ...args: Parameters<typeof reorderStaffActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof reorderStaffActionImpl>>>> {
  return toActionResult(() => reorderStaffActionImpl(...args));
}

async function reorderStaffActionImpl(orderedIds: string[]): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolvePositionsCapabilities(user).canManagePositions) {
    throw new Error("FORBIDDEN: staff reorder");
  }
  await staffRepository.reorderStaff(orderedIds);
}

/**
 * A person's puestos (project flow BE §7.2). `team.canEditCollaborator`.
 * Only `manual` rows are replaced; `workspace` rows stay.
 * Returns GOOGLE_MANAGED_REFUSAL for a Google-managed person when position
 * mappings exist and the set differs from the workspace rows. Otherwise only
 * the `manual` rows are replaced (puestos that come from Workspace stay).
 * Errors: FORBIDDEN, NOT_FOUND.
 */
export async function setStaffPositionsAction(
  ...args: Parameters<typeof setStaffPositionsActionImpl>
): Promise<ActionResult<void>> {
  return refusalResult(() => setStaffPositionsActionImpl(...args));
}

async function setStaffPositionsActionImpl(
  staffId: string,
  positionIds: string[]
): Promise<GoogleManagedRefusal | void> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canEditCollaborator) throw flowError("FORBIDDEN");
  const id = parseInput(UuidSchema, staffId);
  const wanted = [...new Set(parseInput(UuidArraySchema, positionIds))];
  if (!(await staffRepository.staffExists(id))) throw flowError("NOT_FOUND", "staff");
  // Puestos of Google-managed staff come from Workspace once position mappings exist (BE §7.2).
  if ((await staffRepository.googleManagedStaffIds([id])).has(id) && (await staffRepository.hasPositionGroupMappings())) {
    const workspace = new Set(await staffRepository.listStaffPositionIds(id, "workspace"));
    if (workspace.size !== wanted.length || wanted.some((p) => !workspace.has(p))) return GOOGLE_MANAGED_REFUSAL;
  }
  // The repository replaces only the manual rows; puestos held from Workspace stay.
  await positionsRepository.setStaffPositions(id, wanted);
}

/**
 * True when Workspace manages this person's puestos (BE §7.2) and `wanted`
 * differs from the puestos Workspace gave them.
 */
async function isPositionsLocked(staffId: string, wanted: string[], executor: FlowExecutor): Promise<boolean> {
  if (!(await staffRepository.googleManagedStaffIds([staffId], executor)).has(staffId)) return false;
  if (!(await staffRepository.hasPositionGroupMappings(executor))) return false;
  const workspace = new Set(await staffRepository.listStaffPositionIds(staffId, "workspace", executor));
  return workspace.size !== wanted.length || wanted.some((p) => !workspace.has(p));
}

/**
 * The collaborator editor's save (Query Migration 6): create or update the
 * person, their profile, their manual puestos and their system access in
 * **one** transaction, so a failure in any step leaves nothing saved.
 *
 * Auth: `team.canCreateCollaborator` to create, `team.canEditCollaborator` to
 * edit, plus `team.canChangeCollaboratorAccess` when `credential` is sent.
 * A role or puestos change on a Google-managed person fails with the
 * `GOOGLE_MANAGED_REFUSAL` copy. Returns the saved `StaffDetail`. Errors:
 * FORBIDDEN, INVALID, NOT_FOUND (unknown staff or puesto).
 *
 * Revalidation: only the shell (`'/', 'layout'`) when the viewer renamed
 * themself; the Personas caches are invalidated by the caller's mutation.
 */
export async function saveMemberAction(input: MemberEditorInput): Promise<ActionResult<StaffDetail>> {
  return toActionResult(() => saveMemberActionImpl(input));
}

async function saveMemberActionImpl(input: MemberEditorInput): Promise<StaffDetail> {
  const user = await requireCapabilityUser();
  const caps = resolveTeamCapabilities(user);
  const parsed = parseInput(MemberEditorInputSchema, input);
  if (parsed.staffId === null && !caps.canCreateCollaborator) throw new Error("FORBIDDEN: staff create");
  if (parsed.staffId !== null && !caps.canEditCollaborator) throw new Error("FORBIDDEN: staff edit");
  if (parsed.credential && !caps.canChangeCollaboratorAccess) throw new Error("FORBIDDEN: staff access");

  const fields: StaffInput = {
    name: parsed.staff.name,
    lastName: parsed.staff.lastName,
    ...(parsed.staff.role !== undefined ? { role: parsed.staff.role } : {}),
    email: parsed.staff.email,
    phone: parsed.staff.phone,
    capacity: parsed.staff.capacity,
    availability: parsed.staff.availability,
  };

  let renamedSelf = false;
  const staffId = await db.transaction(async (tx) => {
    let id: string;
    if (parsed.staffId === null) {
      id = (await staffRepository.createStaff(fields, user.member.id, tx)).id;
    } else {
      id = parsed.staffId;
      const before = await staffRepository.getStaffRoleLock(id, tx);
      if (!before) throw new Error("NOT_FOUND: staff");
      if (await isRoleLocked(id, fields, tx)) throw new Error(GOOGLE_MANAGED_ERROR);
      await staffRepository.updateStaff(id, fields, user.member.id, tx);
      renamedSelf = id === user.member.id;
    }

    await staffRepository.upsertStaffProfile(id, parsed.profile, tx);

    if (parsed.positionIds) {
      const wanted = [...new Set(parsed.positionIds)];
      if (!(await staffRepository.staffExists(id, tx))) throw flowError("NOT_FOUND", "staff");
      if (await isPositionsLocked(id, wanted, tx)) throw new Error(GOOGLE_MANAGED_ERROR);
      await positionsRepository.setStaffPositions(id, wanted, tx);
    }

    if (parsed.credential) {
      await staffRepository.setStaffCredential(id, parsed.credential, tx);
    }
    return id;
  });

  // The viewer's own name shows in the shell (avatar menu) on every page.
  if (renamedSelf) revalidatePath("/", "layout");
  const saved = await staffRepository.getStaff(staffId);
  if (!saved) throw new Error("NOT_FOUND: staff");
  return saved;
}
