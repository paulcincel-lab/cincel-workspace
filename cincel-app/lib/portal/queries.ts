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

import { toPortalProjectDTO, toPortalScheduleDTO, toPortalTramosDTO, type PortalScheduleTaskRow } from "./dto";
import type { PortalProjectAccess } from "./session-store";

/**
 * The portal's read layer (BE §B.4.3). Portal pages and routes read data only
 * through these functions, never through staff repositories. Each query
 * selects the columns its DTO needs and nothing else; the mappers in ./dto.ts
 * shape the result.
 *
 * A project is visible to a portal user only with an active (not revoked)
 * `project_portal_access` row, while the project is not soft-deleted and not
 * `cancelado`. `listPortalProjects` applies those conditions itself. The
 * per-project reads take the `PortalProjectAccess` that `requireProjectAccess`
 * returned (Query Migration Phase 11): visibility is checked once per request
 * and these reads don't repeat it. A `PortalProjectAccess` only comes from that
 * check, so a caller can't reach a project without it.
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

/** The columns `toPortalProjectDTO` reads. */
const PROJECT_COLUMNS = {
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
};

const managerJoin = and(eq(manager.id, projects.managerId), isNull(manager.deletedAt));

/** The projects a portal user can see, by name. */
export async function listPortalProjects(portalUserId: string): Promise<PortalProjectDTO[]> {
  const rows = await db
    .select(PROJECT_COLUMNS)
    .from(projectPortalAccess)
    .innerJoin(projects, eq(projects.id, projectPortalAccess.projectId))
    .leftJoin(manager, managerJoin)
    .where(visibleTo(portalUserId))
    .orderBy(asc(projects.name));
  return rows.map(toPortalProjectDTO);
}

/** The project of a checked access (one query, no visibility join). Null only if it vanished meanwhile. */
export async function getPortalProject(access: PortalProjectAccess): Promise<PortalProjectDTO | null> {
  const [row] = await db
    .select(PROJECT_COLUMNS)
    .from(projects)
    .leftJoin(manager, managerJoin)
    .where(eq(projects.id, access.projectId))
    .limit(1);
  return row ? toPortalProjectDTO(row) : null;
}

/**
 * The project's schedule per `planta` / `seccion`, or null when the project
 * has no schedule. One query: the schedule row left-joined with its tasks.
 * Only the columns the section summary needs are read: no `tarea`,
 * `responsable`, flags, payment rows, imprevistos or adicionales.
 */
export async function getPortalSchedule(access: PortalProjectAccess): Promise<PortalScheduleDTO> {
  const rows = await db
    .select({
      scheduleId: projectSchedules.id,
      planta: scheduleTasks.planta,
      seccion: scheduleTasks.seccion,
      seccionOrder: scheduleTasks.seccionOrder,
      sortOrder: scheduleTasks.sortOrder,
      inicio: scheduleTasks.inicio,
      fin: scheduleTasks.fin,
      status: scheduleTasks.status,
    })
    .from(projectSchedules)
    .leftJoin(scheduleTasks, eq(scheduleTasks.scheduleId, projectSchedules.id))
    .where(eq(projectSchedules.projectId, access.projectId))
    .orderBy(asc(scheduleTasks.sortOrder));
  if (rows.length === 0) return null;

  const tasks: PortalScheduleTaskRow[] = [];
  for (const row of rows) {
    // A schedule without tasks comes back as one row of nulls (left join).
    if (row.planta === null || row.seccion === null || row.seccionOrder === null || row.sortOrder === null ||
      row.inicio === null || row.fin === null || row.status === null) continue;
    tasks.push({ planta: row.planta, seccion: row.seccion, seccionOrder: row.seccionOrder, sortOrder: row.sortOrder,
      inicio: row.inicio, fin: row.fin, status: row.status });
  }
  return toPortalScheduleDTO(tasks);
}

/**
 * The tramo catalog with the project's state in each (FE §3.11 `PhaseStepper`). One query: the project's
 * current tramo comes with the access row. Reads only the tramo key, name, order and the project's stage
 * dates; nothing about tasks or staff.
 */
export async function getPortalProjectTramos(access: PortalProjectAccess): Promise<PortalTramoDTO[]> {
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
    .leftJoin(
      projectStages,
      and(eq(projectStages.workflowId, workflows.id), eq(projectStages.projectId, access.projectId))
    )
    .where(isNull(workflows.deletedAt))
    .orderBy(asc(workflows.sortOrder), asc(workflows.name));
  return toPortalTramosDTO(rows, access.currentWorkflowId);
}
