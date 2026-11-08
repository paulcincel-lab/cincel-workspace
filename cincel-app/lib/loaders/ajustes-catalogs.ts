import "server-only";

import { isNull } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { AJUSTES_SEGMENT_CAPABILITY } from "@/lib/auth/ajustes-segments";
import { resolveTaskStatusesCapabilities, resolveWorkflowsCapabilities } from "@/lib/auth/permissions";
import { buildDefaultPermissionsState } from "@/lib/auth/permissionsState";
import {
  DEFAULT_SYSTEM_ACCESS_ROLE,
  hasDefaultSystemAdministratorAccess,
  isAdministratorRole,
  normalizeSystemAccessRole,
  SYSTEM_ADMIN_ROLE,
  type SystemAccessRole,
} from "@/lib/data/roles";
import { db } from "@/lib/db/client";
import { staff } from "@/lib/db/schema";
import * as positionsRepository from "@/lib/repositories/positions-repository";
import { STAFF_ORDER } from "@/lib/repositories/staff-repository";
import * as taskStatusesRepository from "@/lib/repositories/task-statuses-repository";
import * as workflowsRepository from "@/lib/repositories/workflows-repository";
import type {
  AjustesEstatusPageData,
  AjustesPermisosPageData,
  AjustesPuestosPageData,
  AjustesTramosPageData,
  PermisosStaffRow,
} from "@/lib/types/ajustes-catalogs";

/**
 * Loaders of the Ajustes catalog segments (Query Migration 9b, #964):
 * estatus, puestos, tramos and permisos. Each checks the segment capability
 * (`AJUSTES_SEGMENT_CAPABILITY`, the rule of the segment layout) and throws
 * FORBIDDEN without it, so the page-data actions and the server prefetch
 * apply the same rule. Their result is dehydrated into public HTML: only
 * what the page shows leaves the server.
 */

type CatalogSegment = "estatus" | "puestos" | "tramos" | "permisos";

function requireSegment(user: AuthenticatedUser, segment: CatalogSegment): void {
  if (!AJUSTES_SEGMENT_CAPABILITY[segment](user)) throw new Error(`FORBIDDEN: ajustes ${segment}`);
}

/** Estatus: the custom task statuses (1 q). */
export async function loadAjustesEstatus(user: AuthenticatedUser): Promise<AjustesEstatusPageData> {
  requireSegment(user, "estatus");
  if (!resolveTaskStatusesCapabilities(user).canViewTaskStatuses) return { statuses: [] };
  return { statuses: await taskStatusesRepository.listTaskStatuses() };
}

/**
 * Puestos: the puestos (4 q) and the active tramos with their active fases
 * for the candidate picker, in one query (`listWorkflowPhaseTree`): 5 q in
 * one wave, instead of the full `listWorkflows` (5 q in 3 waves).
 */
export async function loadAjustesPuestos(user: AuthenticatedUser): Promise<AjustesPuestosPageData> {
  requireSegment(user, "puestos");
  const [positions, workflows] = await Promise.all([
    positionsRepository.listPositions(),
    workflowsRepository.listWorkflowPhaseTree(),
  ]);
  return { positions, workflows };
}

/** Tramos y fases: every tramo, fase and template, inactive ones included for a manager (as `fetchWorkflowsAction`). */
export async function loadAjustesTramos(user: AuthenticatedUser): Promise<AjustesTramosPageData> {
  requireSegment(user, "tramos");
  const workflows = resolveWorkflowsCapabilities(user).canManageWorkflows
    ? await workflowsRepository.listWorkflows({
        includeInactive: true,
        includeInactiveTemplates: true,
        includeInactivePhases: true,
      })
    : await workflowsRepository.listWorkflows({});
  return { workflows };
}

/**
 * The access the server gives a person (`lib/auth/session.ts`): Administrador
 * for an admin role or a default admin email, else `staff.role`.
 */
function accessOf(row: { role: string | null; email: string | null }): SystemAccessRole {
  if (isAdministratorRole(row.role) || hasDefaultSystemAdministratorAccess(row.email)) return SYSTEM_ADMIN_ROLE;
  return normalizeSystemAccessRole(row.role) ?? DEFAULT_SYSTEM_ACCESS_ROLE;
}

/**
 * Permisos (read-only, #950): every live person, active or not, with the
 * access the server resolves for them, plus the default permission matrix.
 * The email is read only to resolve the access and never leaves the server.
 * 1 q. FORBIDDEN for anyone but an Administrador.
 */
export async function loadAjustesPermisos(user: AuthenticatedUser): Promise<AjustesPermisosPageData> {
  requireSegment(user, "permisos");
  const rows = await db
    .select({
      id: staff.id,
      name: staff.name,
      lastName: staff.lastName,
      active: staff.active,
      role: staff.role,
      email: staff.email,
    })
    .from(staff)
    .where(isNull(staff.deletedAt))
    .orderBy(...STAFF_ORDER);
  const people: PermisosStaffRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    lastName: row.lastName,
    active: row.active,
    access: accessOf(row),
  }));
  return { staff: people, defaultPermissions: buildDefaultPermissionsState() };
}
