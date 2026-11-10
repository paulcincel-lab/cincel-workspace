import "server-only";

import { cache } from "react";

import { isProtectedPermissionRole, type PermissionOverrides } from "@/lib/auth/permissions";
import { buildPermissionsMatrix, type PermissionsMatrix } from "@/lib/auth/permissionsState";
import type { SystemAccessRole } from "@/lib/data/roles";
import { listRolePermissions } from "@/lib/repositories/role-permissions-repository";

/**
 * The permission matrix the server enforces (#971): the saved
 * `core.role_permissions` overrides merged over the defaults. One read per
 * server render (React `cache`); outside a render (Server Action requests,
 * route handlers) each call reads again, so a saved change applies from the
 * next request on.
 */
export const getPermissionsMatrix = cache(async (): Promise<PermissionsMatrix> => {
  return buildPermissionsMatrix(await listRolePermissions());
});

/** The saved overrides of one access, or undefined (the defaults). A protected role never reads the table. */
export async function getRolePermissionOverrides(role: SystemAccessRole): Promise<PermissionOverrides | undefined> {
  if (isProtectedPermissionRole(role)) return undefined;
  const overrides = (await getPermissionsMatrix()).overrides[role];
  return overrides && Object.keys(overrides).length > 0 ? overrides : undefined;
}
