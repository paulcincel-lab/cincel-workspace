import "server-only";

import { isNull } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { AJUSTES_SEGMENT_CAPABILITY } from "@/lib/auth/ajustes-segments";
import { resolveTaskStatusesCapabilities, resolveWorkflowsCapabilities } from "@/lib/auth/permissions";
import { getPermissionsMatrix } from "@/lib/auth/permissions-matrix";
import { defaultPermissionsState } from "@/lib/auth/permissionsState";
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
  AjustesEtapasPageData,
  PermisosStaffRow,
} from "@/lib/types/ajustes-catalogs";

/**
 * Loaders of the Ajustes catalog segments (Query Migration 9b, #964):
 * estatus, puestos, etapas and permisos. Each checks the segment capability
 * (`AJUSTES_SEGMENT_CAPABILITY`, the rule of the segment layout) and throws
 * FORBIDDEN without it, so the page-data actions and the server prefetch
 * apply the same rule. Their result is dehydrated into public HTML: only
 * what the page shows leaves the server.
 */

type CatalogSegment = "estatus" | "puestos" | "etapas" | "permisos";

function requireSegment(user: AuthenticatedUser, segment: CatalogSegment): void {
  if (!AJUSTES_SEGMENT_CAPABILITY[segment](user)) throw new Error(`FORBIDDEN: ajustes ${segment}`);
}

const NO_BASE_COUNTS: AjustesEstatusPageData["baseCounts"] = { pendiente: 0, en_proceso: 0, completado: 0, bloqueado: 0 };

/** Estatus: the custom task statuses, tasks per base status and per custom status (3 q in one wave). */
export async function loadAjustesEstatus(user: AuthenticatedUser): Promise<AjustesEstatusPageData> {
  requireSegment(user, "estatus");
  if (!resolveTaskStatusesCapabilities(user).canViewTaskStatuses) {
    return { statuses: [], baseCounts: { ...NO_BASE_COUNTS }, customUsage: {} };
  }
  const [statuses, baseCounts, customUsage] = await Promise.all([
    taskStatusesRepository.listTaskStatuses(),
    taskStatusesRepository.countTasksByBaseStatus(),
    taskStatusesRepository.countCustomStatusUsage(),
  ]);
  return { statuses, baseCounts, customUsage };
}

/**
 * Puestos: the puestos (4 q) and the active etapas with their active fases
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

/**
 * Etapas y fases: every etapa, fase and template, inactive ones included for
 * a manager (as `fetchWorkflowsAction`), plus active projects per etapa and
 * tasks per fase, in one wave.
 */
export async function loadAjustesEtapas(user: AuthenticatedUser): Promise<AjustesEtapasPageData> {
  requireSegment(user, "etapas");
  const [workflows, activeProjects, phaseTaskCounts] = await Promise.all([
    resolveWorkflowsCapabilities(user).canManageWorkflows
      ? workflowsRepository.listWorkflows({
          includeInactive: true,
          includeInactiveTemplates: true,
          includeInactivePhases: true,
        })
      : workflowsRepository.listWorkflows({}),
    workflowsRepository.countActiveProjectsByWorkflow(),
    workflowsRepository.countTasksByPhase(),
  ]);
  return { workflows, activeProjects, phaseTaskCounts };
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
 * Permisos (#950, #971): every live person, active or not, with the access
 * the server resolves for them, the default matrix and the saved matrix the
 * server enforces. The email is read only to resolve the access and never
 * leaves the server. 2 q. FORBIDDEN for anyone but an Administrador.
 */
export async function loadAjustesPermisos(user: AuthenticatedUser): Promise<AjustesPermisosPageData> {
  requireSegment(user, "permisos");
  const [rows, matrix] = await Promise.all([
    db
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
      .orderBy(...STAFF_ORDER),
    getPermissionsMatrix(),
  ]);
  const people: PermisosStaffRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    lastName: row.lastName,
    active: row.active,
    access: accessOf(row),
  }));
  return {
    staff: people,
    defaultPermissions: defaultPermissionsState(),
    permissions: matrix.permissions,
    hasCustom: matrix.hasCustom,
  };
}
