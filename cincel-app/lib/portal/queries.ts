import "server-only";

import { and, asc, count, eq, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import {
  projectMembers,
  projectPortalAccess,
  projectProgressSnapshots,
  projects,
  projectSchedules,
  projectStages,
  scheduleTasks,
  staff,
  tasks,
  workflows,
} from "@/lib/db/schema";
import type { PortalProjectDTO, PortalScheduleDTO, PortalTeamMemberDTO, PortalEtapaDTO } from "@/lib/types/portal";

import {
  toPortalProjectDTO,
  toPortalScheduleDTO,
  toPortalTeamMemberDTO,
  toPortalEtapasDTO,
  type PortalScheduleTaskRow,
} from "./dto";
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
const scheduleEtapa = alias(workflows, "schedule_etapa");

/**
 * Progress of the project's first snapshot this month (Mexico City calendar), for `progressDeltaMonth`;
 * null without one. A correlated subquery, so both project reads stay one query.
 */
const progressMonthStart = sql<number | null>`(
  select ${projectProgressSnapshots.progressPct} from ${projectProgressSnapshots}
  where ${projectProgressSnapshots.projectId} = ${projects.id}
    and ${projectProgressSnapshots.takenOn} >= date_trunc('month', now() at time zone 'America/Mexico_City')::date
  order by ${projectProgressSnapshots.takenOn} asc
  limit 1
)`.mapWith(Number);

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
  progressMonthStart,
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
 * `responsable`, flags, payment rows, imprevistos or adicionales. The real
 * dates and the linked etapa's key feed Real / Desvío and "Fases por etapa".
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
      startedOn: scheduleTasks.startedOn,
      finishedOn: scheduleTasks.finishedOn,
      etapaKey: scheduleEtapa.key,
    })
    .from(projectSchedules)
    .leftJoin(scheduleTasks, eq(scheduleTasks.scheduleId, projectSchedules.id))
    .leftJoin(scheduleEtapa, and(eq(scheduleEtapa.id, scheduleTasks.workflowId), isNull(scheduleEtapa.deletedAt)))
    .where(eq(projectSchedules.projectId, access.projectId))
    .orderBy(asc(scheduleTasks.sortOrder));
  if (rows.length === 0) return null;

  const tasks: PortalScheduleTaskRow[] = [];
  for (const row of rows) {
    // A schedule without tasks comes back as one row of nulls (left join).
    if (row.planta === null || row.seccion === null || row.seccionOrder === null || row.sortOrder === null ||
      row.inicio === null || row.fin === null || row.status === null) continue;
    tasks.push({ planta: row.planta, seccion: row.seccion, seccionOrder: row.seccionOrder, sortOrder: row.sortOrder,
      inicio: row.inicio, fin: row.fin, status: row.status, startedOn: row.startedOn, finishedOn: row.finishedOn,
      etapaKey: row.etapaKey });
  }
  return toPortalScheduleDTO(tasks);
}

/**
 * The etapa catalog with the project's state and progress in each (FE §3.11 `PhaseStepper`, Portal Visual
 * Fases). One query: the catalog with the project's stage dates (the current etapa comes with the access row),
 * left-joined with, per etapa, the number of live tasks of this project and how many are closed. Only those
 * counts leave the aggregate: no task titles, statuses or staff.
 */
export async function getPortalProjectEtapas(access: PortalProjectAccess): Promise<PortalEtapaDTO[]> {
  const progress = db
    .select({
      workflowId: tasks.workflowId,
      total: count().as("total"),
      done: sql<number>`count(*) filter (where ${tasks.closedAt} is not null)`.as("done"),
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, access.projectId), isNull(tasks.deletedAt), eq(tasks.archived, false)))
    .groupBy(tasks.workflowId)
    .as("portal_etapa_progress");

  const rows = await db
    .select({
      id: workflows.id,
      key: workflows.key,
      name: workflows.name,
      active: workflows.active,
      sortOrder: workflows.sortOrder,
      startedAt: projectStages.startedAt,
      closedAt: projectStages.closedAt,
      total: progress.total,
      done: progress.done,
    })
    .from(workflows)
    .leftJoin(
      projectStages,
      and(eq(projectStages.workflowId, workflows.id), eq(projectStages.projectId, access.projectId))
    )
    .leftJoin(progress, eq(progress.workflowId, workflows.id))
    .where(isNull(workflows.deletedAt))
    .orderBy(asc(workflows.sortOrder), asc(workflows.name));

  return toPortalEtapasDTO(
    rows,
    access.currentWorkflowId,
    rows.map((r) => ({ workflowId: r.id, total: r.total ?? 0, done: r.done ?? 0 }))
  );
}

/** Role shown for the project's manager when they have no `project_members` role. */
export const PORTAL_MANAGER_ROLE = "Responsable del proyecto";

/**
 * "Tu equipo Cincel": the project's manager first, then the other `project_members` by name. One query over
 * `staff`, left-joined with this project's `project_members`; soft-deleted staff are left out. Each person is a
 * name and a role; only the manager keeps an email (the same one `PortalProjectDTO.manager` already exposes),
 * so members have no **Escribir**.
 */
export async function getPortalTeam(access: PortalProjectAccess): Promise<PortalTeamMemberDTO[]> {
  const isMember = isNotNull(projectMembers.projectId);
  const rows = await db
    .select({
      id: staff.id,
      name: staff.name,
      lastName: staff.lastName,
      email: staff.email,
      role: projectMembers.role,
    })
    .from(staff)
    .leftJoin(projectMembers, and(eq(projectMembers.staffId, staff.id), eq(projectMembers.projectId, access.projectId)))
    .where(and(isNull(staff.deletedAt), access.managerId ? or(eq(staff.id, access.managerId), isMember) : isMember))
    .orderBy(asc(staff.name), asc(staff.lastName));

  const manager = rows.find((r) => r.id === access.managerId);
  const team: PortalTeamMemberDTO[] = [];
  if (manager) {
    team.push(
      toPortalTeamMemberDTO({ name: manager.name, lastName: manager.lastName, role: manager.role || PORTAL_MANAGER_ROLE,
        email: manager.email })
    );
  }
  for (const r of rows) {
    if (r === manager) continue;
    team.push(toPortalTeamMemberDTO({ name: r.name, lastName: r.lastName, role: r.role, email: null }));
  }
  return team;
}

/** The Drive id of the project's cover photo (`projects.cover_drive_file_id`), or null while staff haven't set one. */
export async function getPortalProjectCoverFileId(access: PortalProjectAccess): Promise<string | null> {
  const [row] = await db
    .select({ cover: projects.coverDriveFileId })
    .from(projects)
    .where(eq(projects.id, access.projectId))
    .limit(1);
  return row?.cover?.trim() ? row.cover.trim() : null;
}
