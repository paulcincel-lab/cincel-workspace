"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toActionResult } from "@/lib/actions/action-result";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { AJUSTES_SEGMENT_CAPABILITY } from "@/lib/auth/ajustes-segments";
import {
  buildPermissionsMatrix,
  describePermissionChanges,
  findInvalidPermissionCell,
  rowsFromPermissionsState,
  type PermissionsState,
} from "@/lib/auth/permissionsState";
import { requireCapabilityUser } from "@/lib/auth/session";
import * as rolePermissionsRepository from "@/lib/repositories/role-permissions-repository";
import type { ActionResult } from "@/lib/types/schedule";
import { parseInput } from "@/lib/validation/project-flow";

/**
 * Ajustes › Permisos writes (#971). Only a viewer with the Permisos segment
 * capability (Administrador) may save or restore; anyone else gets FORBIDDEN.
 * The matrix is stored as overrides of the defaults (`core.role_permissions`),
 * every changed cell is logged in `auth_events`, and the root layout is
 * revalidated so the session the client mirrors carries the new overrides.
 * Administrador and the capped exports are never stored (`isPermissionLocked`).
 */

const SHORT = z.string().max(80);
const SavePermissionsInput = z.object({
  permissions: z.record(SHORT, z.record(SHORT, z.record(SHORT, z.union([z.boolean(), SHORT])))),
});

export type PermissionsSaveResult = {
  /** The matrix the server enforces after the write. */
  permissions: PermissionsState;
  hasCustom: boolean;
  /** How many cells changed (0: nothing was written). */
  changed: number;
};

async function requirePermissionsAdmin(): Promise<AuthenticatedUser> {
  const user = await requireCapabilityUser();
  if (!AJUSTES_SEGMENT_CAPABILITY.permisos(user)) throw new Error("FORBIDDEN: permisos");
  return user;
}

async function writeMatrix(
  user: AuthenticatedUser,
  next: ReturnType<typeof rowsFromPermissionsState>,
  kind: rolePermissionsRepository.PermissionsAuditKind,
): Promise<PermissionsSaveResult> {
  const before = buildPermissionsMatrix(await rolePermissionsRepository.listRolePermissions());
  const after = buildPermissionsMatrix(next);
  const changes = describePermissionChanges(before.permissions, after.permissions);
  if (changes.length > 0) {
    await rolePermissionsRepository.replaceRolePermissions({ rows: next, actorId: user.member.id, kind, changes });
    revalidatePath("/", "layout");
  }
  return { permissions: after.permissions, hasCustom: after.hasCustom, changed: changes.length };
}

/** Saves the edited matrix. Errors: `FORBIDDEN`, `INVALID: <path>`. */
export async function savePermissionsMatrixAction(
  input: z.input<typeof SavePermissionsInput>,
): Promise<ActionResult<PermissionsSaveResult>> {
  return toActionResult(async () => {
    const user = await requirePermissionsAdmin();
    const { permissions } = parseInput(SavePermissionsInput, input);
    const invalid = findInvalidPermissionCell(permissions);
    if (invalid) throw new Error(`INVALID: ${invalid}`);
    return writeMatrix(user, rowsFromPermissionsState(permissions), "permissions_changed");
  });
}

/** Back to the default permissions for every role. Errors: `FORBIDDEN`. */
export async function restoreDefaultPermissionsAction(): Promise<ActionResult<PermissionsSaveResult>> {
  return toActionResult(async () => {
    const user = await requirePermissionsAdmin();
    return writeMatrix(user, [], "permissions_restored");
  });
}
