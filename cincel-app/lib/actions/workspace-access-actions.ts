"use server";

import { revalidatePath } from "next/cache";

import { recheckStaffAccess } from "@/lib/auth/access-recheck";
import { recordDirectoryError } from "@/lib/auth/directory-error-log";
import { loadGoogleHealth } from "@/lib/auth/google-health";
import { getSessionAccess } from "@/lib/auth/session";
import { OFFICIAL_CINCEL_ROLES, SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import { DirectoryError, getDirectory } from "@/lib/google/directory";
import * as mappingsRepository from "@/lib/repositories/workspace-group-mappings-repository";
import type { GroupMappingValues } from "@/lib/repositories/workspace-group-mappings-repository";
import type {
  GoogleHealth,
  GroupMapping,
  GroupMappingError,
  GroupMappingInput,
  GroupMappingResult,
  RecheckStaffAccessResult,
} from "@/lib/types/workspace-access";

/**
 * Configuración → Google (BE §A.7): Estado, Grupos de Google and the access
 * re-check from Equipo. Every action requires role Administrador, the same
 * rule `AppRouteGuard` applies to `/configuracion/*`.
 */

const GOOGLE_SETTINGS_PATH = "/configuracion/google";
const TEAM_PATH = "/equipo";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";

type Fail = { ok: false; error: GroupMappingError };
const fail = (error: GroupMappingError): Fail => ({ ok: false, error });

const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

async function isAdministrator(): Promise<boolean> {
  try {
    const access = await getSessionAccess();
    return access.status === "active" && access.user?.access === SYSTEM_ADMIN_ROLE;
  } catch {
    return false;
  }
}

/** Whether an error (or its `cause`, as drizzle wraps driver errors) is a unique violation. */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && (current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Shape checks that don't need Google; the group id comes later from `groups.get`. */
async function validate(input: GroupMappingInput): Promise<Omit<GroupMappingValues, "groupId"> | null> {
  if (!input || typeof input !== "object") return null;
  const groupEmail = typeof input.groupEmail === "string" ? input.groupEmail.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(groupEmail)) return null;

  if (input.kind === "role") {
    const role = input.role;
    if (typeof role !== "string" || !(OFFICIAL_CINCEL_ROLES as readonly string[]).includes(role)) return null;
    if (input.areaId) return null;
    const rank = input.rank ?? 0;
    if (!Number.isInteger(rank)) return null;
    return { groupEmail, kind: "role", role, areaId: null, rank };
  }

  if (input.kind === "area") {
    const areaId = input.areaId;
    if (!isUuid(areaId) || input.role) return null;
    if (!(await mappingsRepository.areaExists(areaId))) return null;
    return { groupEmail, kind: "area", role: null, areaId, rank: 0 };
  }

  return null;
}

/** Validates the input and resolves the group with `groups.get`. */
async function resolveValues(input: GroupMappingInput, exceptId?: string): Promise<GroupMappingValues | Fail> {
  const shape = await validate(input);
  if (!shape) return fail("invalid");

  const directory = getDirectory();
  if (!directory) {
    console.error("[group-mappings] Directory error (service account not configured)");
    await recordDirectoryError("group_mapping", { kind: "network", status: null });
    return fail("directory_error");
  }
  let group;
  try {
    group = await directory.getGroup(shape.groupEmail);
  } catch (error) {
    if (error instanceof DirectoryError) {
      console.error(`[group-mappings] Directory error (${error.kind}${error.status ? ` ${error.status}` : ""})`);
      await recordDirectoryError("group_mapping", error);
      return fail("directory_error");
    }
    throw error;
  }
  if (!group) return fail("group_not_found");

  if (await mappingsRepository.groupMappingExists(group.id, shape.kind, exceptId)) return fail("duplicate");
  return {
    ...shape,
    groupEmail: group.email.trim().toLowerCase(),
    groupId: group.id,
  };
}

export async function listGroupMappingsAction(): Promise<GroupMapping[]> {
  if (!(await isAdministrator())) throw new Error("FORBIDDEN: group mappings list");
  return mappingsRepository.listGroupMappings();
}

export async function createGroupMappingAction(input: GroupMappingInput): Promise<GroupMappingResult> {
  if (!(await isAdministrator())) return fail("forbidden");
  const values = await resolveValues(input);
  if ("ok" in values) return values;
  try {
    const mapping = await mappingsRepository.insertGroupMapping(values);
    revalidatePath(GOOGLE_SETTINGS_PATH);
    return { ok: true, mapping };
  } catch (error) {
    if (isUniqueViolation(error)) return fail("duplicate");
    throw error;
  }
}

export async function updateGroupMappingAction(id: string, input: GroupMappingInput): Promise<GroupMappingResult> {
  if (!(await isAdministrator())) return fail("forbidden");
  if (!isUuid(id) || !(await mappingsRepository.getGroupMapping(id))) return fail("invalid");

  const values = await resolveValues(input, id);
  if ("ok" in values) return values;
  try {
    const mapping = await mappingsRepository.updateGroupMapping(id, values);
    if (!mapping) return fail("invalid");
    revalidatePath(GOOGLE_SETTINGS_PATH);
    return { ok: true, mapping };
  } catch (error) {
    if (isUniqueViolation(error)) return fail("duplicate");
    throw error;
  }
}

export async function deleteGroupMappingAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "invalid" }> {
  if (!(await isAdministrator())) return { ok: false, error: "forbidden" };
  if (!isUuid(id)) return { ok: false, error: "invalid" };
  await mappingsRepository.deleteGroupMapping(id);
  revalidatePath(GOOGLE_SETTINGS_PATH);
  return { ok: true };
}

/**
 * Revisar acceso ahora (BE §A.7): runs the §A.5 re-check for one staff member
 * now, ignoring the interval. A revoke deletes their sessions at once.
 */
export async function recheckStaffAccessAction(staffId: string): Promise<RecheckStaffAccessResult> {
  if (!(await isAdministrator())) return { ok: false, error: "forbidden" };
  if (!isUuid(staffId)) return { ok: false, error: "not_google_linked" };

  const outcome = await recheckStaffAccess(staffId, { force: true });
  switch (outcome.status) {
    case "kept":
      revalidatePath(TEAM_PATH);
      return { ok: true, allowed: true };
    case "revoked":
      revalidatePath(TEAM_PATH);
      return { ok: true, allowed: false, reason: outcome.reason };
    case "error":
      return { ok: false, error: "directory_error" };
    default:
      return { ok: false, error: "not_google_linked" };
  }
}

/** Configuración → Google → Estado (BE §A.7, FE §5). */
export async function getGoogleHealthAction(): Promise<GoogleHealth> {
  if (!(await isAdministrator())) throw new Error("FORBIDDEN: google health");
  return loadGoogleHealth();
}
