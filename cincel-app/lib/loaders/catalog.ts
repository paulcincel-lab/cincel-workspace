import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import {
  resolveClientsCapabilities,
  resolveProjectsCapabilities,
  resolveTaskStatusesCapabilities,
  resolveTeamCapabilities,
} from "@/lib/auth/permissions";
import { zonedIsoDate } from "@/lib/dates/zoned-formatters";
import { db } from "@/lib/db/client";
import { contacts, projects, staff } from "@/lib/db/schema";
import * as projectSpacesRepository from "@/lib/repositories/project-spaces-repository";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import * as staffRepository from "@/lib/repositories/staff-repository";
import * as taskStatusesRepository from "@/lib/repositories/task-statuses-repository";
import * as workflowsRepository from "@/lib/repositories/workflows-repository";
import { getGeneralSettings } from "@/lib/settings/general-settings-server";
import type {
  CatalogAssignableStaffOption,
  CatalogContactOption,
  CatalogProjectOption,
  CatalogStaffOption,
} from "@/lib/types/catalog";
import type { ContactType, ProjectSpace, TaskStatusOption, WorkflowRef } from "@/lib/types/core";

/**
 * Catalog loaders (Query Migration 1b, #954): `(user, input) => data`. The
 * page-data actions in `lib/actions/page-data/catalog-actions.ts` call them
 * after the session check, and a server prefetch calls them directly, so each
 * loader applies the page capability itself and returns only what the viewer
 * may see. Staff rows are `{id,name}` (+ `suggested`), never the full `Staff`.
 */

/** The display name pickers show today: nombre + apellido. */
function staffDisplayName(row: { name: string; lastName: string | null }): string {
  return [row.name, row.lastName].filter(Boolean).join(" ");
}

/** Live projects `{id,name,status,currentWorkflowId}`, by name. `canViewProjects`, else `[]`. */
export async function loadCatalogProjectOptions(user: AuthenticatedUser): Promise<CatalogProjectOption[]> {
  if (!resolveProjectsCapabilities(user).canViewProjects) return [];
  return db
    .select({ id: projects.id, name: projects.name, status: projects.status, currentWorkflowId: projects.currentWorkflowId })
    .from(projects)
    .where(isNull(projects.deletedAt))
    .orderBy(asc(projects.name));
}

/**
 * Active tramos by `sortOrder` (`catalog.workflows` and `catalog.tramos`).
 * Any staff session, as `fetchWorkflowsAction` (Actividades, Proyectos, Equipo
 * and Puestos all need them): the caller checks the session, no page capability.
 */
export async function loadCatalogWorkflows(): Promise<WorkflowRef[]> {
  return workflowsRepository.listTramosNav();
}

/** The task status catalog. `canViewTaskStatuses`, else `[]`. */
export async function loadCatalogTaskStatuses(user: AuthenticatedUser): Promise<TaskStatusOption[]> {
  if (!resolveTaskStatusesCapabilities(user).canViewTaskStatuses) return [];
  return taskStatusesRepository.listTaskStatuses();
}

/** Active staff `{id,name}`, manual order first (#452). `canViewTeam`, else `[]`. */
export async function loadCatalogStaff(user: AuthenticatedUser): Promise<CatalogStaffOption[]> {
  if (!resolveTeamCapabilities(user).canViewTeam) return [];
  const rows = await db
    .select({ id: staff.id, name: staff.name, lastName: staff.lastName })
    .from(staff)
    .where(and(isNull(staff.deletedAt), eq(staff.active, true)))
    .orderBy(sql`${staff.sortOrder} is null`, asc(staff.sortOrder), asc(staff.name));
  return rows.map((r) => ({ id: r.id, name: staffDisplayName(r) }));
}

/**
 * Staff who can take a task `{id,name,suggested}`: with a tramo, the ones
 * whose puesto covers it come first, each with `openCount` / `overdueCount`
 * (their open tasks in the tramo, overdue = due before today in the org time
 * zone; the quick-add suggestions). Any staff session, as
 * `fetchAssignableStaffAction` (every task form assigns).
 */
export async function loadCatalogAssignableStaff(
  _user: AuthenticatedUser,
  input: { workflowId: string | null },
  options: { now?: Date } = {},
): Promise<CatalogAssignableStaffOption[]> {
  const { workflowId } = input;
  const rows = await staffRepository.listAssignableStaff({ workflowId });
  if (!workflowId) return rows.map((r) => ({ id: r.id, name: staffDisplayName(r), suggested: r.suggested }));
  const { settings } = await getGeneralSettings();
  const todayIso = zonedIsoDate(options.now ?? new Date(), settings.regional.timeZone);
  const counts = await staffRepository.countOpenTasksInTramo(workflowId, todayIso);
  return rows.map((r) => ({
    id: r.id,
    name: staffDisplayName(r),
    suggested: r.suggested,
    openCount: counts.get(r.id)?.open ?? 0,
    overdueCount: counts.get(r.id)?.overdue ?? 0,
  }));
}

/**
 * A project's espacios by `sortOrder`, with live task counts. `null` when the
 * viewer can't see the project: no `canViewProjects`, or the project doesn't
 * exist or is deleted.
 */
export async function loadCatalogProjectSpaces(
  user: AuthenticatedUser,
  input: { projectId: string },
): Promise<ProjectSpace[] | null> {
  if (!resolveProjectsCapabilities(user).canViewProjects) return null;
  if (!(await projectsRepository.projectExists(input.projectId))) return null;
  return projectSpacesRepository.listSpaces(input.projectId);
}

/** Live contacts `{id,name,type}`, by name, optionally of one type. `canViewClients`, else `[]`. */
export async function loadCatalogContacts(
  user: AuthenticatedUser,
  input: { type?: ContactType },
): Promise<CatalogContactOption[]> {
  if (!resolveClientsCapabilities(user).canViewClients) return [];
  return db
    .select({ id: contacts.id, name: contacts.name, type: contacts.type })
    .from(contacts)
    .where(and(isNull(contacts.deletedAt), input.type ? eq(contacts.type, input.type) : undefined))
    .orderBy(asc(contacts.name));
}
