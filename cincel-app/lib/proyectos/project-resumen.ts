import "server-only";

import type { ProjectTabsProps } from "@/components/proyectos/ProjectTabs";
import { listProjectPortalAccessAction } from "@/lib/actions/portal-actions";
import { fetchProjectAction, fetchProjectSpacesAction, fetchProjectsPortfolioAction } from "@/lib/actions/projects-actions";
import { IMPLEMENTED as PROJECTS_IMPLEMENTED } from "@/lib/actions/projects-actions.flags";
import { fetchScheduleAction } from "@/lib/actions/schedule-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { fetchTasksAction } from "@/lib/actions/tasks-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolvePortalCapabilities } from "@/lib/auth/permissions";
import { getStaffFilesProject, listStaffProjectFiles } from "@/lib/google/staff-files-app";
import { projectTaskStats, type ProjectStaffInfo, type ProjectSummaryInput } from "@/lib/proyectos/project-summary";
import { canSeeClientContacts, scopeProjectForResumen } from "@/lib/proyectos/resumen-visibility";
import { canSeeAdminData, listTramos } from "@/lib/tramos/compat";
import type { ProjectDetail, WorkflowRef } from "@/lib/types/core";
import type { StaffFileItem } from "@/lib/types/workspace-access";

/** The project's timezone for "today" (same as the Cronograma). */
const PROJECT_TIMEZONE = "America/Mexico_City";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PROJECT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}

/** A failed secondary read must not take the Resumen down: it renders without that part. */
async function orFallback<T>(read: Promise<T>, fallback: T, what: string): Promise<T> {
  try {
    return await read;
  } catch (error) {
    console.error(`[proyecto-resumen] ${what} failed`, error);
    return fallback;
  }
}

/** Active tramos in order: the compat catalog, else the workflows rows. */
async function tramoCatalog(): Promise<WorkflowRef[]> {
  try {
    return await listTramos();
  } catch {
    const workflows = await orFallback(fetchWorkflowsAction(), [], "workflows");
    return workflows
      .filter((w) => w.active)
      .map((w) => ({ id: w.id, key: w.key, name: w.name, sortOrder: w.sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

async function rootFiles(staffId: string, projectId: string): Promise<StaffFileItem[] | null> {
  const project = await getStaffFilesProject(projectId);
  if (!project) return null;
  const result = await listStaffProjectFiles(staffId, project, null);
  return result.status === "ok" ? result.items : null;
}

async function portfolioRow(projectId: string) {
  if (!PROJECTS_IMPLEMENTED.fetchProjectsPortfolioAction) return null;
  const rows = await fetchProjectsPortfolioAction();
  return rows.find((row) => row.projectId === projectId) ?? null;
}

export type ProjectResumen = {
  tabs: Omit<ProjectTabsProps, "active" | "showEstilo">;
  summary: ProjectSummaryInput;
};

/**
 * Everything `/proyectos/[id]` (Resumen) renders, read once on the server
 * (redesign FE §3.5): header + tab data and the Resumen input. Null when the
 * project doesn't exist or the viewer can't see it. Tasks come from
 * `fetchTasksAction`, which leaves admin tasks out; the portfolio row carries
 * `budgetSpentPct` only for `canSeeAdminData`; the budget, client and contacts
 * are dropped here for viewers who may not see them.
 */
export async function loadProjectResumen(projectId: string, user: AuthenticatedUser): Promise<ProjectResumen | null> {
  let detail: ProjectDetail | null = null;
  try {
    detail = await fetchProjectAction(projectId);
  } catch {
    // Malformed id or no project access: not found.
  }
  if (!detail) return null;

  const isAdmin = canSeeAdminData(user);
  const showClientContacts = canSeeClientContacts(user, detail);
  const canManagePortal = resolvePortalCapabilities(user).manageAccess;
  const today = todayIso();

  const [tasks, portfolio, schedule, files, spaces, staff, tramos, clientes] = await Promise.all([
    orFallback(fetchTasksAction({ projectId: detail.id }), [], "tasks"),
    orFallback(portfolioRow(detail.id), null, "portfolio"),
    orFallback(fetchScheduleAction(detail.id), null, "schedule"),
    orFallback(rootFiles(user.member.id, detail.id), null, "files"),
    orFallback(fetchProjectSpacesAction(detail.id), [], "spaces"),
    orFallback(fetchStaffAction(), [], "staff"),
    tramoCatalog(),
    canManagePortal
      ? orFallback(
          listProjectPortalAccessAction(detail.id).then((rows) => rows.length),
          0,
          "portal access"
        )
      : Promise.resolve(0),
  ]);

  // Subtasks live inside their parent task; the tab count and "n de m tareas" count top-level tasks.
  const topLevel = tasks.filter((task) => !task.parentTaskId);
  const taskStats = projectTaskStats(topLevel, today, detail.currentWorkflowId);
  const project = scopeProjectForResumen(detail, showClientContacts);
  const staffInfo: Record<string, ProjectStaffInfo> = Object.fromEntries(
    staff.map((person) => [person.id, { email: person.email, puesto: person.role }])
  );

  return {
    tabs: {
      project: {
        id: project.id,
        name: project.name,
        tramo: project.currentWorkflow,
        projectType: project.projectType,
        addressCity: project.addressCity,
        manager: project.manager,
      },
      counts: { tareas: taskStats.total, archivos: files?.length ?? 0, clientes },
      canManagePortal,
    },
    summary: {
      project,
      portfolio: portfolio ? { ...portfolio, budgetSpentPct: isAdmin ? portfolio.budgetSpentPct : null } : null,
      tramoCatalog: tramos,
      taskStats,
      schedule: schedule ? { tasks: schedule.data.tasks, payments: isAdmin ? schedule.data.payments : [] } : null,
      files,
      spaces: spaces.map((space) => ({ id: space.id, name: space.name })),
      staff: staffInfo,
      showBudget: isAdmin,
      showClientContacts,
      today: schedule?.today ?? today,
    },
  };
}
