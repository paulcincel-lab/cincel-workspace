import "server-only";

import { and, asc, eq, isNull, ne, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import {
  projectPortalAccess,
  projects,
  projectSchedules,
  projectStages,
  scheduleTasks,
  staff,
  workflows,
} from "@/lib/db/schema";
import type { PortalProjectDTO, PortalScheduleDTO, PortalTramoDTO } from "@/lib/types/portal";

import { toPortalProjectDTO, toPortalScheduleDTO, toPortalTramosDTO } from "./dto";

/**
 * The portal's read layer (BE §B.4.3). Portal pages and routes read data only
 * through these functions, never through staff repositories. Each query
 * selects the columns its DTO needs and nothing else; the mappers in ./dto.ts
 * shape the result.
 *
 * A project is visible to a portal user only with an active (not revoked)
 * `project_portal_access` row, while the project is not soft-deleted and not
 * `cancelado`. Callers still run requirePortalUser() / requireProjectAccess()
 * first; the same conditions are repeated here so a query can never return a
 * project the user has no access to.
 */

const manager = alias(staff, "manager");

function visibleTo(portalUserId: string): SQL {
  return and(
    eq(projectPortalAccess.portalUserId, portalUserId),
    isNull(projectPortalAccess.revokedAt),
    isNull(projects.deletedAt),
    ne(projects.status, "cancelado")
  ) as SQL;
}

function selectPortalProjects(where: SQL) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      addressStreet: projects.addressStreet,
      addressCity: projects.addressCity,
      addressState: projects.addressState,
      status: projects.status,
      progress: projects.progress,
      startDate: projects.startDate,
      endDate: projects.endDate,
      managerName: manager.name,
      managerLastName: manager.lastName,
      managerEmail: manager.email,
    })
    .from(projectPortalAccess)
    .innerJoin(projects, eq(projects.id, projectPortalAccess.projectId))
    .leftJoin(manager, and(eq(manager.id, projects.managerId), isNull(manager.deletedAt)))
    .where(where);
}

/** The projects a portal user can see, by name. */
export async function listPortalProjects(portalUserId: string): Promise<PortalProjectDTO[]> {
  const rows = await selectPortalProjects(visibleTo(portalUserId)).orderBy(asc(projects.name));
  return rows.map(toPortalProjectDTO);
}

/** One project, or null when the portal user has no active access to it. */
export async function getPortalProject(portalUserId: string, projectId: string): Promise<PortalProjectDTO | null> {
  const [row] = await selectPortalProjects(and(visibleTo(portalUserId), eq(projects.id, projectId)) as SQL).limit(1);
  return row ? toPortalProjectDTO(row) : null;
}

/**
 * The project's schedule per `planta` / `seccion`, or null when the project
 * has no schedule or the portal user has no access to it. Only the columns
 * the section summary needs are read: no `tarea`, `responsable`, flags,
 * payment rows, imprevistos or adicionales.
 */
export async function getPortalSchedule(portalUserId: string, projectId: string): Promise<PortalScheduleDTO> {
  const [schedule] = await db
    .select({ id: projectSchedules.id })
    .from(projectSchedules)
    .innerJoin(projects, eq(projects.id, projectSchedules.projectId))
    .innerJoin(projectPortalAccess, eq(projectPortalAccess.projectId, projects.id))
    .where(and(visibleTo(portalUserId), eq(projects.id, projectId)))
    .limit(1);
  if (!schedule) return null;

  const tasks = await db
    .select({
      planta: scheduleTasks.planta,
      seccion: scheduleTasks.seccion,
      seccionOrder: scheduleTasks.seccionOrder,
      sortOrder: scheduleTasks.sortOrder,
      inicio: scheduleTasks.inicio,
      fin: scheduleTasks.fin,
      status: scheduleTasks.status,
    })
    .from(scheduleTasks)
    .where(eq(scheduleTasks.scheduleId, schedule.id))
    .orderBy(asc(scheduleTasks.sortOrder));
  return toPortalScheduleDTO(tasks);
}

/**
 * The tramo catalog with the project's state in each (FE §3.11 `PhaseStepper`), or an empty list when the
 * portal user has no access to the project. Reads only the tramo key, name, order and the project's stage
 * dates; nothing about tasks or staff.
 */
export async function getPortalProjectTramos(portalUserId: string, projectId: string): Promise<PortalTramoDTO[]> {
  const [project] = await db
    .select({ currentWorkflowId: projects.currentWorkflowId })
    .from(projectPortalAccess)
    .innerJoin(projects, eq(projects.id, projectPortalAccess.projectId))
    .where(and(visibleTo(portalUserId), eq(projects.id, projectId)))
    .limit(1);
  if (!project) return [];

  const rows = await db
    .select({
      id: workflows.id,
      key: workflows.key,
      name: workflows.name,
      active: workflows.active,
      sortOrder: workflows.sortOrder,
      startedAt: projectStages.startedAt,
      closedAt: projectStages.closedAt,
    })
    .from(workflows)
    .leftJoin(projectStages, and(eq(projectStages.workflowId, workflows.id), eq(projectStages.projectId, projectId)))
    .where(isNull(workflows.deletedAt))
    .orderBy(asc(workflows.sortOrder), asc(workflows.name));
  return toPortalTramosDTO(rows, project.currentWorkflowId);
}
