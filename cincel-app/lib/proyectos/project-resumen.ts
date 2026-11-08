import "server-only";

import { and, inArray, isNull } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveActivitiesCapabilities, resolveProjectsCapabilities, resolveTeamCapabilities } from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { zonedIsoDate } from "@/lib/dates/zoned-formatters";
import { db } from "@/lib/db/client";
import { staff } from "@/lib/db/schema";
import { getStaffFilesProject, listStaffProjectFiles } from "@/lib/google/staff-files-app";
import { getProjectForViewer } from "@/lib/projects/project-tab-shell";
import { projectTaskStats, type ProjectStaffInfo, type ProjectSummaryInput } from "@/lib/proyectos/project-summary";
import { canSeeClientContacts, scopeProjectForResumen } from "@/lib/proyectos/resumen-visibility";
import * as projectSpacesRepository from "@/lib/repositories/project-spaces-repository";
import { listPortfolioRows } from "@/lib/repositories/projects-portfolio-repository";
import { getScheduleForProject } from "@/lib/repositories/schedule-repository";
import { listTaskRows } from "@/lib/repositories/tasks-repository";
import * as workflowsRepository from "@/lib/repositories/workflows-repository";
import type { ProjectDetail, TaskListRow, WorkflowRef } from "@/lib/types/core";
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

/** Active tramos in order, without keyless rows (what `listTramos` returns), read straight from the repository. */
export async function tramoCatalog(): Promise<WorkflowRef[]> {
  const rows = await workflowsRepository.listTramosNav();
  return rows
    .filter((row) => row.key.trim() !== "")
    .map((row) => ({ id: row.id, key: row.key, name: row.name, sortOrder: row.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Root items of the project's Drive folder: the Resumen's only Drive call. Null when it can't be read. */
async function rootFiles(staffId: string, projectId: string): Promise<StaffFileItem[] | null> {
  const project = await getStaffFilesProject(projectId);
  if (!project) return null;
  const result = await listStaffProjectFiles(staffId, project, null);
  return result.status === "ok" ? result.items : null;
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
 * tramos and the root Drive listing.
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

  const [tasks, portfolio, schedule, files, spaces, team, tramos] = await Promise.all([
    orFallback(projectTasks(detail.id, user), [], "tasks"),
    orFallback(
      listPortfolioRows({ includeAdminData: isAdmin, now, projectIds: [detail.id] }).then((rows) => rows[0] ?? null),
      null,
      "portfolio",
    ),
    orFallback(getScheduleForProject(detail.id, viewer), null, "schedule"),
    orFallback(rootFiles(user.member.id, detail.id), null, "files"),
    orFallback(projectSpacesRepository.listSpaces(detail.id), [], "spaces"),
    orFallback(
      teamStaff(detail, { includeEmail: isAdmin, includePuesto: resolveTeamCapabilities(user).canViewTeam }),
      {},
      "staff",
    ),
    orFallback(tramoCatalog(), [], "tramos"),
  ]);

  // Subtasks live inside their parent task; "n de m tareas" counts top-level tasks.
  const topLevel = tasks.filter((task) => !task.parentTaskId);
  const taskStats = projectTaskStats(topLevel, today, detail.currentWorkflowId);

  return {
    project: scopeProjectForResumen(detail, showClientContacts),
    portfolio: portfolio ? { ...portfolio, budgetSpentPct: isAdmin ? portfolio.budgetSpentPct : null } : null,
    tramoCatalog: tramos,
    taskStats,
    // `getScheduleForProject` never reads payments for non-admins; `[]` keeps the rule here as well.
    schedule: schedule ? { tasks: schedule.tasks, payments: isAdmin ? schedule.payments : [] } : null,
    files,
    spaces: spaces.map((space) => ({ id: space.id, name: space.name })),
    staff: team,
    showBudget: isAdmin,
    showClientContacts,
    today,
  };
}
