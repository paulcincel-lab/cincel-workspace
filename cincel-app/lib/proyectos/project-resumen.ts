import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveActivitiesCapabilities, resolveProjectsCapabilities, resolveTeamCapabilities } from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { zonedIsoDate } from "@/lib/dates/zoned-formatters";
import { db } from "@/lib/db/client";
import { staff, workflowPhases } from "@/lib/db/schema";
import { getStaffFilesProject, listStaffProjectFiles } from "@/lib/google/staff-files-app";
import { getProjectForViewer } from "@/lib/projects/project-tab-shell";
import { occupancyPct } from "@/lib/people/aggregates";
import { projectTaskStats, type ProjectStaffInfo, type ProjectSummaryInput, type TeamLoad } from "@/lib/proyectos/project-summary";
import { canSeeClientContacts, scopeProjectForResumen } from "@/lib/proyectos/resumen-visibility";
import * as peopleRepository from "@/lib/repositories/people-repository";
import * as projectSpacesRepository from "@/lib/repositories/project-spaces-repository";
import { listPortfolioRows } from "@/lib/repositories/projects-portfolio-repository";
import { getScheduleForProject } from "@/lib/repositories/schedule-repository";
import { listTaskRows } from "@/lib/repositories/tasks-repository";
import * as workflowsRepository from "@/lib/repositories/workflows-repository";
import type { ProjectDetail, TaskListRow, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";
import type { StaffFileItem } from "@/lib/types/workspace-access";

/** The project's timezone for "today" (same as the Cronograma). */
const PROJECT_TIMEZONE = "America/Mexico_City";

/** A failed secondary read must not take the Resumen down: it renders without that part. */
async function orFallback<T>(read: Promise<T>, fallback: T, what: string): Promise<T> {
  try {
    return await read;
  } catch (error) {
    console.error(`[proyecto-resumen] ${what} failed`, error);
    return fallback;
  }
}

/** Active etapas in order, without keyless rows (what `listEtapas` returns), read straight from the repository. */
export async function etapaCatalog(): Promise<WorkflowRef[]> {
  const rows = await workflowsRepository.listEtapasNav();
  return rows
    .filter((row) => row.key.trim() !== "")
    .map((row) => ({ id: row.id, key: row.key, name: row.name, sortOrder: row.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Root items of the project's Drive folder (the Resumen's only Drive call)
 * and the folder's link. `items` is null when the folder can't be read.
 */
async function rootFiles(staffId: string, projectId: string): Promise<{ items: StaffFileItem[] | null; folderUrl: string | null }> {
  const project = await getStaffFilesProject(projectId);
  if (!project) return { items: null, folderUrl: null };
  const folderUrl =
    project.driveFolderStatus === "ready" && project.driveFolderId
      ? `https://drive.google.com/drive/folders/${encodeURIComponent(project.driveFolderId)}`
      : null;
  const result = await listStaffProjectFiles(staffId, project, null);
  return { items: result.status === "ok" ? result.items : null, folderUrl };
}

/**
 * Active catalog fases of every etapa, by workflow id, in `sort_order`: one
 * statement. The Esencial etapa line reads "fase {i} de {n}" from it.
 */
async function phasesByEtapa(): Promise<Record<string, WorkflowPhaseRef[]>> {
  const rows = await db
    .select({
      id: workflowPhases.id,
      workflowId: workflowPhases.workflowId,
      name: workflowPhases.name,
      sortOrder: workflowPhases.sortOrder,
    })
    .from(workflowPhases)
    .where(eq(workflowPhases.active, true))
    .orderBy(asc(workflowPhases.workflowId), asc(workflowPhases.sortOrder));
  const byEtapa: Record<string, WorkflowPhaseRef[]> = {};
  for (const row of rows) {
    (byEtapa[row.workflowId] ??= []).push({ id: row.id, name: row.name, sortOrder: row.sortOrder });
  }
  return byEtapa;
}

/** The ids of the project's own staff: responsable, coordinación and active miembros. */
function teamIds(project: ProjectDetail): string[] {
  const ids = new Set<string>();
  if (project.manager) ids.add(project.manager.id);
  if (project.coordinator) ids.add(project.coordinator.id);
  for (const member of project.members) if (member.active !== false) ids.add(member.id);
  return [...ids];
}

/**
 * Staff info for the project's team only (never the whole staff list):
 * `{id, name}`, `puesto` with `team.canViewTeam`, and `email` only for
 * administrators (`canSeeAdminData`). One statement, none without a team.
 */
async function teamStaff(
  project: ProjectDetail,
  opts: { includeEmail: boolean; includePuesto: boolean },
): Promise<Record<string, ProjectStaffInfo>> {
  const ids = teamIds(project);
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: staff.id, name: staff.name, lastName: staff.lastName, email: staff.email, role: staff.role })
    .from(staff)
    .where(and(inArray(staff.id, ids), isNull(staff.deletedAt)));
  return Object.fromEntries(
    rows.map((row) => {
      const info: ProjectStaffInfo = { id: row.id, name: [row.name, row.lastName].filter(Boolean).join(" ") };
      if (opts.includeEmail && row.email) info.email = row.email;
      if (opts.includePuesto && row.role) info.puesto = row.role;
      return [row.id, info];
    }),
  );
}

/**
 * Load of the project's team ("Equipo y carga"): each person's open tasks
 * across every project (responsable or support, admin tasks only with
 * `includeAdmin`) against `staff.capacity`, as on Personas. Two statements,
 * none without a team.
 */
async function teamLoadOf(project: ProjectDetail, includeAdmin: boolean): Promise<TeamLoad> {
  const ids = teamIds(project);
  if (ids.length === 0) return {};
  const [assigned, caps] = await Promise.all([
    peopleRepository.listAssignedOpenTasks(ids, { includeAdmin }),
    db.select({ id: staff.id, capacity: staff.capacity }).from(staff).where(inArray(staff.id, ids)),
  ]);
  const load: TeamLoad = {};
  for (const row of caps) {
    const openTotal = assigned.get(row.id)?.length ?? 0;
    load[row.id] = { openTotal, capacity: row.capacity, loadPct: occupancyPct(openTotal, row.capacity) };
  }
  return load;
}

/** The project's tasks for the counts, in the slim projection; none without `canViewActivities`. */
async function projectTasks(projectId: string, user: AuthenticatedUser): Promise<TaskListRow[]> {
  if (!resolveActivitiesCapabilities(user).canViewActivities) return [];
  return listTaskRows({ projectId }, viewerScopeOf(user));
}

/**
 * Everything Proyecto · Resumen renders (`qk.proyectos.resumen(id)`), read
 * once on the server for `user`. Null without `canViewProjects`, or when the
 * project doesn't exist, is deleted or the id is malformed. The header and
 * tab counts are the shell's (`qk.proyectos.shell(id)`), not part of this.
 *
 * Admin data is stripped here, never in a component (the result is
 * dehydrated into public HTML): the portfolio row's `budgetSpentPct` and the
 * schedule payments only reach `canSeeAdminData`; the client and contacts
 * only reach viewers who may see them; staff emails only reach admins.
 * Reads: the project (deduped with the shell per request), one portfolio
 * row (`listPortfolioRows({ projectIds: [id] })`), the schedule (the
 * Cronograma's source), the slim task rows, spaces, the team's staff rows,
 * etapas, the root Drive listing and the team load (`teamLoad`: open tasks
 * across all projects against capacity, two statements).
 */
export async function loadProjectResumen(projectId: string, user: AuthenticatedUser): Promise<ProjectSummaryInput | null> {
  if (!resolveProjectsCapabilities(user).canViewProjects) return null;
  const viewer = viewerScopeOf(user);
  let detail: ProjectDetail | null = null;
  try {
    detail = await getProjectForViewer(projectId, viewer.staffId, viewer.isAdmin);
  } catch {
    // Malformed id: not found.
  }
  if (!detail) return null;

  const isAdmin = viewer.isAdmin;
  const showClientContacts = canSeeClientContacts(user, detail);
  const now = new Date();
  const today = zonedIsoDate(now, PROJECT_TIMEZONE);

  const [tasks, portfolio, schedule, drive, spaces, team, etapas, phases, teamLoad] = await Promise.all([
    orFallback(projectTasks(detail.id, user), [], "tasks"),
    orFallback(
      listPortfolioRows({ includeAdminData: isAdmin, now, projectIds: [detail.id] }).then((rows) => rows[0] ?? null),
      null,
      "portfolio",
    ),
    orFallback(getScheduleForProject(detail.id, viewer), null, "schedule"),
    orFallback(rootFiles(user.member.id, detail.id), { items: null, folderUrl: null }, "files"),
    orFallback(projectSpacesRepository.listSpaces(detail.id), [], "spaces"),
    orFallback(
      teamStaff(detail, { includeEmail: isAdmin, includePuesto: resolveTeamCapabilities(user).canViewTeam }),
      {},
      "staff",
    ),
    orFallback(etapaCatalog(), [], "etapas"),
    orFallback(phasesByEtapa(), {}, "fases"),
    orFallback(teamLoadOf(detail, isAdmin), {}, "team load"),
  ]);

  // Subtasks live inside their parent task; "n de m tareas" counts top-level tasks.
  const topLevel = tasks.filter((task) => !task.parentTaskId);
  const taskStats = projectTaskStats(topLevel, today, detail.currentWorkflowId);

  return {
    project: scopeProjectForResumen(detail, showClientContacts),
    portfolio: portfolio ? { ...portfolio, budgetSpentPct: isAdmin ? portfolio.budgetSpentPct : null } : null,
    etapaCatalog: etapas,
    taskStats,
    // `getScheduleForProject` never reads payments for non-admins; `[]` keeps the rule here as well.
    schedule: schedule ? { tasks: schedule.tasks, payments: isAdmin ? schedule.payments : [] } : null,
    files: drive.items,
    driveFolderUrl: drive.folderUrl,
    spaces: spaces.map((space) => ({ id: space.id, name: space.name })),
    staff: team,
    showBudget: isAdmin,
    showClientContacts,
    today,
    phasesByEtapa: phases,
    teamLoad,
  };
}
