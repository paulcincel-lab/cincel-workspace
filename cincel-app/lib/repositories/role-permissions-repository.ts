import "server-only";

import { asc } from "drizzle-orm";

import type { RolePermissionRow } from "@/lib/auth/permissionsState";
import { db } from "@/lib/db/client";
import { authEvents, rolePermissions } from "@/lib/db/schema";

/**
 * `core.role_permissions` (Ajustes › Permisos, #971): the saved overrides of
 * the permission matrix. Callers sanitize rows (`storableRows`) before writing
 * and after reading; this module only moves them.
 */

export type StoredRolePermission = { role: string; moduleId: string; key: string; value: unknown };

/** Every saved cell, in a stable order (role, module, key). 1 q. */
export async function listRolePermissions(): Promise<StoredRolePermission[]> {
  return db
    .select({
      role: rolePermissions.role,
      moduleId: rolePermissions.moduleId,
      key: rolePermissions.key,
      value: rolePermissions.value,
    })
    .from(rolePermissions)
    .orderBy(asc(rolePermissions.role), asc(rolePermissions.moduleId), asc(rolePermissions.key));
}

export type PermissionsAuditKind = "permissions_changed" | "permissions_restored";

/**
 * Replaces the whole saved matrix with `rows` and logs one `auth_events` row
 * per changed cell (`changes`), all in one transaction.
 */
export async function replaceRolePermissions(input: {
  rows: readonly RolePermissionRow[];
  actorId: string;
  kind: PermissionsAuditKind;
  changes: readonly string[];
}): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions);
    if (input.rows.length > 0) {
      await tx.insert(rolePermissions).values(
        input.rows.map((row) => ({
          role: row.role,
          moduleId: row.moduleId,
          key: row.key,
          value: row.value,
          updatedBy: input.actorId,
          updatedAt: now,
        })),
      );
    }
    if (input.changes.length > 0) {
      await tx.insert(authEvents).values(
        input.changes.map((reason) => ({ kind: input.kind, staffId: input.actorId, reason, at: now })),
      );
    }
  });
}
