import {
  DEFAULT_SYSTEM_ACCESS_ROLE,
  hasDefaultSystemAdministratorAccess,
  isAdministratorRole,
  isLegacyBlockedAccessRole,
  normalizeSystemAccessRole,
  SYSTEM_ACCESS_ROLES,
  SYSTEM_ADMIN_ROLE,
  type SystemAccessRole,
} from "@/lib/data/roles";

/**
 * The app access role of a staff row (`staff.role` + email), or null when the
 * role blocks access. Pure, with no `server-only` import, so the session, the
 * repositories and the project flow modules (`assertAdminAssignees`) share it
 * (project flow BE §7.5).
 */
export function staffAccessRole(role: string | null, email: string | null): SystemAccessRole | null {
  if (isLegacyBlockedAccessRole(role)) return null;
  const normalized = normalizeSystemAccessRole(role);
  if (normalized && SYSTEM_ACCESS_ROLES.includes(normalized)) return normalized;
  if (isAdministratorRole(role) || hasDefaultSystemAdministratorAccess(email)) {
    return SYSTEM_ADMIN_ROLE;
  }
  return DEFAULT_SYSTEM_ACCESS_ROLE;
}

/** True when the staff row's access role is "Administrador" (admin tasks, client and origin data). */
export function isStaffAdministrator(role: string | null, email: string | null): boolean {
  return staffAccessRole(role, email) === SYSTEM_ADMIN_ROLE;
}
