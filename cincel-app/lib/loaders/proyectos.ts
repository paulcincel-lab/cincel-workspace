import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveActivitiesCapabilities, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { getProjectForViewer } from "@/lib/projects/project-tab-shell";
import { listHistoryPage, type HistoryPage } from "@/lib/repositories/history-repository";
import { getImportData } from "@/lib/repositories/import-repository";
import * as projectSpacesRepository from "@/lib/repositories/project-spaces-repository";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import { listTaskRows } from "@/lib/repositories/tasks-repository";
import { todayInAppTimeZone } from "@/lib/project-flow/admin-tasks";
import { summarizeProjectTasks, type ProyectoTareasSummary } from "@/lib/proyectos/project-tasks-by-fase";
import type { ImportData, ProjectDetail, ProjectSpace, TaskKind, TaskListRow } from "@/lib/types/core";
// Cronograma (5c, #961)
import type { ScheduleViewData } from "@/lib/actions/schedule-actions";
import { scheduleToday } from "@/lib/cronograma/today";
import * as scheduleRepository from "@/lib/repositories/schedule-repository";
import { UuidSchema } from "@/lib/validation/project-flow";
// Archivos and Clientes (5d, #962)
import { canSeeAdminData, resolvePortalCapabilities, type PortalCapabilities } from "@/lib/auth/permissions";
import { driveWebViewLink } from "@/lib/google/drive-url";
import { getStaffFilesProject, listStaffProjectFiles } from "@/lib/google/staff-files-app";
import { isStaffFolderNotFound } from "@/lib/google/staff-files";
import * as portalAccessRepository from "@/lib/repositories/portal-access-repository";
import { listInvitableContacts, type PortalInvitableContact } from "@/lib/repositories/portal-contacts-repository";
import type { PortalAccessRow, PortalActivityRow } from "@/lib/types/portal";
import type { StaffFilesResult } from "@/lib/types/workspace-access";
// List, Resumen and Tareas (5a, #959)
import { loadProjectResumen, tramoCatalog } from "@/lib/proyectos/project-resumen";
import type { ProjectSummaryInput } from "@/lib/proyectos/project-summary";
import { listPortfolioRows } from "@/lib/repositories/projects-portfolio-repository";
import * as workflowsRepository from "@/lib/repositories/workflows-repository";
import type { ProjectCreateStartOptions, ProjectListItem, WorkflowRef } from "@/lib/types/core";
import type { PortfolioRow } from "@/lib/types/redesign";

/**
 * Proyectos loaders (Query Migration Phase 5): `(user, input) => data`. The
 * page-data actions in `lib/actions/page-data/proyectos-actions.ts` call them
 * after the session check, and a server prefetch calls them directly, so each
 * one applies the page capability itself and returns only what the viewer
 * may see (plan §4.8 rule 2).
 */

// ── Ficha (5b, #960) ─────────────────────────────────────────────────────────

/** `qk.proyectos.tab(id, 'ficha')`. */
export type ProyectoFichaData = {
  /** The same cached `getProjectForViewer` read the shell uses; admin-only fields stripped for non-admins. */
  project: ProjectDetail;
  /** One read with a kinds filter: admin tasks only for `canSeeAdminData`. */
  tasks: TaskListRow[];
  /** Also seeds `catalog.projectSpaces(id)`. */
  spaces: ProjectSpace[];
  /** Also seeds `qk.importData('project', id)`. */
  importData: ImportData | null;
};

/** Every task kind: what an administrator's ficha lists (its tasks plus the admin ones). */
const ADMIN_FICHA_KINDS: TaskKind[] = ["workflow", "usuario", "admin"];

/**
 * The ficha task read: `fetchTasksAction({ projectId })` merged with
 * `fetchAdminTasksAction({ projectId, includeClosed: true })` in one
 * statement; null when the viewer may see no task. Non-admins never ask for
 * admin kinds (and the repository drops them anyway).
 */
function fichaTaskFilters(canViewActivities: boolean, isAdmin: boolean): { kind?: TaskKind | TaskKind[] } | null {
  if (isAdmin) return { kind: canViewActivities ? ADMIN_FICHA_KINDS : "admin" };
  return canViewActivities ? {} : null;
}

/**
 * The ficha of `input.id` for `user`, or null when the viewer has no
 * `canViewProjects` or the project doesn't exist or is deleted. At most 6
 * statements: the project (2, shared with the shell through React `cache()`),
 * the tasks (1), the espacios (1) and the import data (1, plus the batch
 * mapping when a non-admin opens an imported project).
 */
export async function loadProyectoFicha(user: AuthenticatedUser, input: { id: string }): Promise<ProyectoFichaData | null> {
  if (!resolveProjectsCapabilities(user).canViewProjects) return null;
  const viewer = viewerScopeOf(user);
  let project: ProjectDetail | null;
  try {
    project = await getProjectForViewer(input.id, viewer.staffId, viewer.isAdmin);
  } catch {
    // Unknown id format: not found.
    return null;
  }
  if (!project) return null;

  const taskFilters = fichaTaskFilters(resolveActivitiesCapabilities(user).canViewActivities, viewer.isAdmin);
  const [tasks, spaces, importData] = await Promise.all([
    taskFilters ? listTaskRows({ ...taskFilters, projectId: project.id }, viewer) : Promise.resolve([] as TaskListRow[]),
    projectSpacesRepository.listSpacesWithCounts(project.id),
    // The project read already proved the row exists and isn't deleted.
    getImportData("project", project.id, { hideClientColumns: !viewer.isAdmin }),
  ]);
  return { project, tasks, spaces, importData };
}

// ── Ficha Bitácora (5b, #960) ────────────────────────────────────────────────

/** Events per Bitácora page. */
export const PROYECTO_HISTORY_PAGE_SIZE = 50;

/** Project history fields non-administrators never see (BE §12, B2). */
const ADMIN_ONLY_HISTORY_FIELDS = ["clientId", "origin", "originStaffId"] as const;

const EMPTY_HISTORY: HistoryPage = { events: [], nextCursor: null };

/**
 * `qk.proyectos.history(id)`: one page of the project bitácora, newest first,
 * `PROYECTO_HISTORY_PAGE_SIZE` events after `cursor`. Client and origin
 * changes are left out for non-admins in SQL. Empty without `canViewProjects`
 * or for a missing or deleted project.
 */
export async function loadProyectoHistory(
  user: AuthenticatedUser,
  input: { id: string; cursor?: string | null },
): Promise<HistoryPage> {
  if (!resolveProjectsCapabilities(user).canViewProjects) return EMPTY_HISTORY;
  try {
    if (!(await projectsRepository.projectExists(input.id))) return EMPTY_HISTORY;
  } catch {
    return EMPTY_HISTORY;
  }
  return listHistoryPage("project", input.id, {
    cursor: input.cursor ?? null,
    limit: PROYECTO_HISTORY_PAGE_SIZE,
    hideFields: viewerScopeOf(user).isAdmin ? [] : ADMIN_ONLY_HISTORY_FIELDS,
  });
}

// ── Cronograma and Reporte (5c, #961) ────────────────────────────────────────

/**
 * `qk.proyectos.cronograma(id)`: the whole schedule of `input.id` and today's
 * date in the schedule timezone, shared by Cronograma and Reporte. Null
 * without `canViewProjects`, for an id that is not a UUID, a soft-deleted
 * project, one outside the viewer's scope or one without a schedule (all
 * checked by `getScheduleForProject`, #946). Schedule payments are admin data:
 * the repository never reads them for non-admins, who get `payments: []`.
 * At most 6 statements and no Drive call.
 */
export async function loadProyectoCronograma(user: AuthenticatedUser, input: { id: string }): Promise<ScheduleViewData | null> {
  if (!resolveProjectsCapabilities(user).canViewProjects) return null;
  if (!UuidSchema.safeParse(input.id).success) return null;

  const data = await scheduleRepository.getScheduleForProject(input.id, viewerScopeOf(user));
  if (!data) return null;
  return { data, today: scheduleToday() };
}

// ── Archivos and Clientes (5d, #962) ─────────────────────────────────────────

/** `qk.proyectos.archivos(id, folder)`: one Drive folder of the project. */
export type ProyectoArchivosData =
  | { kind: "ok"; result: StaffFilesResult; canRetry: boolean }
  | { kind: "not_found" }
  | { kind: "drive_error" };

/** `qk.proyectos.tab(id, 'clientes')`: the staff side of the client portal. */
export type ProyectoClientesData = {
  rows: PortalAccessRow[];
  /** Only the fields the Invitar cliente sheet renders. */
  contacts: PortalInvitableContact[];
  capabilities: PortalCapabilities;
  hasClient: boolean;
  canAssignClient: boolean;
  clientFolderUrl: string | null;
};

/** The project as the viewer sees it (`canViewProjects` + scope), or null; the shell's cached read. */
async function visibleProject(user: AuthenticatedUser, id: string): Promise<ProjectDetail | null> {
  if (!resolveProjectsCapabilities(user).canViewProjects) return null;
  if (!UuidSchema.safeParse(id).success) return null;
  const viewer = viewerScopeOf(user);
  try {
    return await getProjectForViewer(id, viewer.staffId, viewer.isAdmin);
  } catch {
    return null;
  }
}

/**
 * The Archivos tab: one folder listing of `input.id` (the root when
 * `folderId` is null). `not_found` for a project out of scope or deleted
 * (checked before any Drive call) and for a folder outside the project.
 * Read-only: it never creates folders (Reintentar carpeta is the explicit
 * mutation). `canRetry` is `canEditProjectGeneral`.
 */
export async function loadProyectoArchivos(
  user: AuthenticatedUser,
  input: { id: string; folderId: string | null },
): Promise<ProyectoArchivosData> {
  const project = await visibleProject(user, input.id);
  if (!project) return { kind: "not_found" };
  const files = await getStaffFilesProject(project.id);
  if (!files) return { kind: "not_found" };
  try {
    const result = await listStaffProjectFiles(user.member.id, files, input.folderId);
    return { kind: "ok", result, canRetry: resolveProjectsCapabilities(user).canEditProjectGeneral };
  } catch (error) {
    if (isStaffFolderNotFound(error)) return { kind: "not_found" };
    console.error("[archivos] Drive request failed", error);
    return { kind: "drive_error" };
  }
}

/** The portal capability the Clientes tab needs; FORBIDDEN without it. */
function requireManagePortal(user: AuthenticatedUser): PortalCapabilities {
  const capabilities = resolvePortalCapabilities(user);
  if (!capabilities.manageAccess) throw new Error("FORBIDDEN");
  return capabilities;
}

/**
 * The Clientes tab of `input.id`: every access row (revoked included), the
 * invitable contacts (one statement) and the "02 Cliente" folder link.
 * FORBIDDEN without `portal.manageAccess`; null for a project out of scope
 * or deleted. No Drive call. At most 5 statements.
 */
export async function loadProyectoClientes(
  user: AuthenticatedUser,
  input: { id: string },
): Promise<ProyectoClientesData | null> {
  const capabilities = requireManagePortal(user);
  const project = await visibleProject(user, input.id);
  if (!project) return null;

  const [rows, invitable, folderId] = await Promise.all([
    portalAccessRepository.listProjectAccess(project.id),
    listInvitableContacts(project.id),
    portalAccessRepository.findProjectClientFolderId(project.id),
  ]);
  // Strip to the sheet's fields: nothing else reaches the dehydrated cache.
  const contacts = invitable.map(({ id, name, type, email, isProjectClient }) => ({ id, name, type, email, isProjectClient }));
  const isAdmin = canSeeAdminData(user);
  return {
    rows,
    contacts,
    capabilities,
    hasClient: isAdmin ? project.client !== null : contacts.some((contact) => contact.isProjectClient),
    canAssignClient: isAdmin,
    clientFolderUrl: folderId ? driveWebViewLink(folderId, true) : null,
  };
}

/**
 * `qk.proyectos.clientesActivity(id)`: the last 50 client file events, newest
 * first. FORBIDDEN without `portal.manageAccess`; null for a project out of
 * scope or deleted.
 */
export async function loadProyectoClientesActivity(
  user: AuthenticatedUser,
  input: { id: string },
): Promise<PortalActivityRow[] | null> {
  requireManagePortal(user);
  const project = await visibleProject(user, input.id);
  if (!project) return null;
  return portalAccessRepository.listProjectActivity(project.id);
}

// ── List, Resumen and Tareas (5a, #959) ──────────────────────────────────────

/** `qk.proyectos.list()`: the `/proyectos` portfolio. */
export type ProyectosPageData = {
  projects: ProjectListItem[];
  /** `budgetSpentPct` is null unless `canSeeAdminData`. */
  portfolio: PortfolioRow[];
  tramos: WorkflowRef[];
  /** Presale starts on its own when a project is created (the create dialog's copy). */
  presaleAutoStart: boolean;
  canSeeAdminData: boolean;
  canCreateProject: boolean;
  /** The board may move projects between tramos (`setProjectCurrentTramoAction` checks it again). */
  canChangeProjectStage: boolean;
  /** Project fields edit in place (Responsable, #1026); `updateProjectAction` checks it again. Absent = false. */
  canEditProjectGeneral?: boolean;
  /** The create dialog shows "Tramo inicial" (`canCreateProject` and `activities.canCreateActivity`, #1034). Absent = false. */
  canPickStartTramo?: boolean;
  /** The viewer's staff id ("Solo míos": manager, coordinator or member). */
  viewerStaffId: string;
  /** Today in the project timezone (`scheduleToday`), `YYYY-MM-DD`: the delivery timeline's first day. */
  today: string;
};

/** `qk.proyectos.tab(id, 'tareas')`: the project Tareas tab. */
export type ProyectoTareasData = {
  /** One slim read; admin tasks only for `canSeeAdminData`. */
  tasks: TaskListRow[];
  /** `canSeeAdminData`: the tab shows the "Administración" group. */
  includeAdmin: boolean;
};

/** Every task kind: an administrator's Tareas tab also lists the admin tasks (BE §8.6). */
const ADMIN_TAREAS_KINDS: TaskKind[] = ["workflow", "usuario", "admin"];

/**
 * `/proyectos` for `user`: the projects, their portfolio rows, the tramos and
 * the create dialog's flags. Without `canViewProjects`, empty lists. The
 * create dialog's client and staff options are not here: they are lazy
 * `catalog.contacts('cliente')` / `catalog.staff()` queries. At most 8
 * statements: projects (3: rows, tramos, members), portfolio (3), tramos (1),
 * Presale auto-start (1).
 */
export async function loadProyectosPage(user: AuthenticatedUser, now: Date = new Date()): Promise<ProyectosPageData> {
  const capabilities = resolveProjectsCapabilities(user);
  const isAdmin = canSeeAdminData(user);
  const viewerStaffId = viewerScopeOf(user).staffId;
  const today = scheduleToday(now);
  if (!capabilities.canViewProjects) {
    return {
      projects: [],
      portfolio: [],
      tramos: [],
      presaleAutoStart: false,
      canSeeAdminData: isAdmin,
      canCreateProject: false,
      canChangeProjectStage: false,
      canEditProjectGeneral: false,
      viewerStaffId,
      today,
    };
  }
  const [projects, portfolio, tramos, presaleAutoStart] = await Promise.all([
    projectsRepository.listProjects({}, viewerScopeOf(user)),
    listPortfolioRows({ includeAdminData: isAdmin, now }),
    tramoCatalog(),
    workflowsRepository.presaleAutoStart(),
  ]);
  return {
    projects,
    // The repository already nulls the budget for non-admins; the loader keeps the rule too.
    portfolio: isAdmin ? portfolio : portfolio.map((row) => ({ ...row, budgetSpentPct: null })),
    tramos,
    presaleAutoStart,
    canSeeAdminData: isAdmin,
    canCreateProject: capabilities.canCreateProject,
    canChangeProjectStage: capabilities.canChangeProjectStage,
    canEditProjectGeneral: capabilities.canEditProjectGeneral,
    canPickStartTramo: canPickStartTramo(user),
    viewerStaffId,
    today,
  };
}

/** Choosing the starting tramo of a new project: create projects and start tramos (#1034). */
function canPickStartTramo(user: AuthenticatedUser): boolean {
  return resolveProjectsCapabilities(user).canCreateProject && resolveActivitiesCapabilities(user).canCreateActivity;
}

/**
 * `qk.proyectos.createStart()`: the create dialog's "Tramo inicial" options
 * (#1034), one query (`listWorkflowPhaseTree`). Null without
 * `canPickStartTramo`.
 */
export async function loadProjectCreateStartOptions(user: AuthenticatedUser): Promise<ProjectCreateStartOptions | null> {
  if (!canPickStartTramo(user)) return null;
  const tree = await workflowsRepository.listWorkflowPhaseTree();
  const first = tree[0];
  return {
    defaultWorkflowId: first && first.autoStart === "on_create" && first.phases.length > 0 ? first.id : null,
    tramos: tree.map((wf) => ({
      id: wf.id,
      key: wf.key,
      name: wf.name,
      sortOrder: wf.sortOrder,
      phases: wf.phases.map((p) => ({ id: p.id, name: p.name, sortOrder: p.sortOrder, templateCount: p.templateCount })),
    })),
  };
}

/**
 * Proyecto · Resumen of `input.id` for `user` (`lib/proyectos/project-resumen.ts`):
 * null without `canViewProjects`, for an id that is not a UUID, or for a
 * missing or deleted project. Admin data is stripped there.
 */
export async function loadProyectoResumen(user: AuthenticatedUser, input: { id: string }): Promise<ProjectSummaryInput | null> {
  if (!UuidSchema.safeParse(input.id).success) return null;
  return loadProjectResumen(input.id, user);
}

/**
 * The project Tareas tab of `input.id`: one slim task read (subtasks
 * included; the tab counts them on their parent). Null without
 * `canViewProjects`, for an id that is not a UUID, or for a missing or
 * deleted project. Without `canViewActivities`, no tasks.
 */
export async function loadProyectoTareas(user: AuthenticatedUser, input: { id: string }): Promise<ProyectoTareasData | null> {
  const project = await visibleProject(user, input.id);
  if (!project) return null;
  const includeAdmin = canSeeAdminData(user);
  if (!resolveActivitiesCapabilities(user).canViewActivities) return { tasks: [], includeAdmin };
  const tasks = await listTaskRows(
    { projectId: project.id, ...(includeAdmin ? { kind: ADMIN_TAREAS_KINDS } : {}) },
    viewerScopeOf(user),
  );
  return { tasks, includeAdmin };
}

/**
 * `qk.proyectos.tareasSummary(id, { responsable, q })` loader (#1051): the
 * project Tareas tab's groups, chip counts and Responsable options, so the
 * tab loads only the rows it shows (`qk.tareas.list`, 30 a page). Null like
 * `loadProyectoTareas`; without `canViewActivities`, an empty summary.
 */
export async function loadProyectoTareasSummary(
  user: AuthenticatedUser,
  input: { id: string; responsable: string | null; q: string },
): Promise<ProyectoTareasSummary | null> {
  const data = await loadProyectoTareas(user, { id: input.id });
  if (!data) return null;
  return summarizeProjectTasks(data.tasks, {
    includeAdmin: data.includeAdmin,
    today: todayInAppTimeZone(),
    responsable: input.responsable,
    q: input.q,
  });
}
