"use server";

import { toActionResult } from "@/lib/actions/action-result";
import type { ActionResult } from "@/lib/types/schedule";
import { revalidateInicioScreen } from "@/lib/cache/screens/inicio";
import { after } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import {
  canSeeAdminData,
  resolveActivitiesCapabilities,
  resolveProjectsCapabilities,
} from "@/lib/auth/permissions";
import { retryProjectFolders, syncProjectFolderName, syncProjectFolders } from "@/lib/google/project-folders-app";
import { actionErrorCode } from "@/lib/errors";
import { FLOW_ERROR, flowError } from "@/lib/project-flow/errors";
import * as projectSpacesRepository from "@/lib/repositories/project-spaces-repository";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import { scopeProjectDto, viewerScopeOf } from "@/lib/auth/viewer-scope";
import type {
  HistoryEvent,
  ProjectCreateInput,
  ProjectDetail,
  ProjectInput,
  ProjectLink,
  ProjectLinkInput,
  ProjectListItem,
  ProjectSpace,
  ViewerScope,
} from "@/lib/types/core";
import type { ProjectFilters } from "@/lib/repositories/projects-repository";
import { OrderedIdsSchema, ProjectSpaceNameSchema, UuidSchema, parseInput } from "@/lib/validation/project-flow";
import { portfolioFor } from "@/lib/projects/portfolio";
import type { ProjectDeleteResult, ProjectRestoreResult } from "@/lib/types/project-delete";
import type { PortfolioRow } from "@/lib/types/redesign";

async function requireProjectsCapabilities() {
  return resolveProjectsCapabilities(await requireCapabilityUser());
}

/** Changes that move a project between tramos also show on Inicio (BE §7.3). Tareas reads `qk.tareas.*` (Phase 4). */
function revalidateProjectFlow() {
  revalidateInicioScreen();
}

export async function fetchProjectsAction(filters: ProjectFilters = {}): Promise<ProjectListItem[]> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canViewProjects) return [];
  return projectsRepository.listProjects(filters, viewerScopeOf(user));
}

/** Client, origin and monday import data are null for non-admins (BE §8.5). */
export async function fetchProjectAction(id: string): Promise<ProjectDetail | null> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canViewProjects) return null;
  return projectsRepository.getProject(id, viewerScopeOf(user));
}

/** Create/update revalidation (BE §7.3): Inicio. Proyectos reads `qk.proyectos.*` (5a, #959) and Tareas `qk.tareas.*` (Phase 4). */
function revalidateProjectEdit() {
  revalidateInicioScreen();
}

/** Patch keys only administrators may send (BE §7.3). */
const ADMIN_ONLY_PROJECT_KEYS = ["clientId", "origin", "originStaffId"] as const;

const viewerOf = (user: AuthenticatedUser): ViewerScope => ({ staffId: user.member.id, isAdmin: canSeeAdminData(user) });

/**
 * Creates a project with only a name (BE §9.4). Older callers may still pass
 * a full `ProjectInput`; only `name`, `startWorkflowId` and `phaseIds` are
 * read. `canCreateProject`; choosing the starting tramo (sending
 * `startWorkflowId` or `phaseIds`) also needs `activities.canCreateActivity`,
 * the Iniciar tramo sheet's capability (#1034). Errors: FORBIDDEN, EMPTY,
 * NAME_TAKEN, INVALID, PHASE_MISMATCH, NO_PHASES.
 */
export async function createProjectAction(
  ...args: Parameters<typeof createProjectActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createProjectActionImpl>>>> {
  return toActionResult(() => createProjectActionImpl(...args));
}

async function createProjectActionImpl(input: ProjectCreateInput | ProjectInput): Promise<ProjectDetail> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canCreateProject) {
    throw new Error("FORBIDDEN: project create");
  }
  const { startWorkflowId, phaseIds } = (input ?? {}) as ProjectCreateInput;
  const picksTramo = startWorkflowId !== undefined || phaseIds !== undefined;
  if (picksTramo && !resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: start etapa");
  }
  const row = await projectsRepository.createProject(
    picksTramo ? { name: input?.name, startWorkflowId, phaseIds } : { name: input?.name },
    user.member.id
  );
  // Drive runs after the response; no client yet, so only the internal folders.
  // A failure leaves the project with drive_folder_status = failed.
  after(() => syncProjectFolders(row.id));
  revalidateProjectEdit();
  return row;
}

/** Codes the create sheet shows as copy instead of the generic error. */
const CREATE_PROJECT_CODES = new Set(["FORBIDDEN", "EMPTY", "NAME_TAKEN", "INVALID", "PHASE_MISMATCH", "NO_PHASES"]);

/**
 * `createProjectAction` for the create sheet. Production builds hide the
 * message of an error thrown by a Server Action, so the known codes come back
 * as a value the sheet can turn into copy. Other errors still throw.
 */
export async function submitProjectCreateAction(
  input: ProjectCreateInput
): Promise<{ ok: true; project: ProjectDetail } | { ok: false; error: string }> {
  try {
    return { ok: true, project: await createProjectActionImpl(input) };
  } catch (err) {
    const code = actionErrorCode(err);
    if (CREATE_PROJECT_CODES.has(code)) return { ok: false, error: code };
    throw err;
  }
}

/**
 * `canEditProjectGeneral`; `clientId`, `origin` and `originStaffId` also
 * require an administrator. Errors: FORBIDDEN, NOT_FOUND, EMPTY, NAME_TAKEN.
 */
export async function updateProjectAction(
  ...args: Parameters<typeof updateProjectActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateProjectActionImpl>>>> {
  return toActionResult(() => updateProjectActionImpl(...args));
}

async function updateProjectActionImpl(
  id: string,
  patch: Partial<ProjectInput>
): Promise<ProjectDetail> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProjectGeneral) {
    throw new Error("FORBIDDEN: project edit");
  }
  const viewer = viewerOf(user);
  if (!viewer.isAdmin && ADMIN_ONLY_PROJECT_KEYS.some((k) => patch[k] !== undefined)) {
    throw new Error("FORBIDDEN: admin only fields");
  }
  const row = await projectsRepository.updateProject(id, patch, user.member.id, viewer);
  if (patch.name !== undefined || patch.code !== undefined) after(() => syncProjectFolderName(id));
  // Setting a client adds "02 Cliente" and "03 Del cliente" to the Drive tree (BE §8.8).
  if (typeof patch.clientId === "string" && patch.clientId) after(() => syncProjectFolders(id));
  revalidateProjectEdit();
  return row;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RetryProjectFolderResult =
  | { ok: true; status: "ready" | "failed"; error?: string }
  | { ok: false; error: "forbidden" | "not_found" };

/**
 * Reintentar carpeta (BE §A.6.1): creates the project's Drive folders now, or
 * only the missing ones, and waits for Drive. Gated by canEditProjectGeneral.
 */
export async function retryProjectFolderAction(projectId: string): Promise<RetryProjectFolderResult> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProjectGeneral) return { ok: false, error: "forbidden" };
  if (typeof projectId !== "string" || !UUID_RE.test(projectId)) return { ok: false, error: "not_found" };

  const result = await retryProjectFolders(projectId);
  if (result.status === "not_found") return { ok: false, error: "not_found" };
  // No revalidation: the caller invalidates the Archivos, Resumen and shell keys (5d, #962).
  if (result.status === "ready") return { ok: true, status: "ready" };
  return { ok: true, status: "failed", error: result.error };
}

export async function archiveProjectAction(
  ...args: Parameters<typeof archiveProjectActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof archiveProjectActionImpl>>>> {
  return toActionResult(() => archiveProjectActionImpl(...args));
}

async function archiveProjectActionImpl(id: string, status: "completado" | "cancelado"): Promise<ProjectDetail> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canArchiveProject) {
    throw new Error("FORBIDDEN: project archive");
  }
  const row = await projectsRepository.updateProject(id, { status }, user.member.id, viewerOf(user));
  return row;
}

export async function deleteProjectAction(
  ...args: Parameters<typeof deleteProjectActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deleteProjectActionImpl>>>> {
  return toActionResult(() => deleteProjectActionImpl(...args));
}

/**
 * Deletes the project with its live tasks and subtasks, and revokes its
 * portal access (#1050). `canDeleteProject`. The Drive folder stays.
 * Errors: FORBIDDEN, NOT_FOUND. The caller invalidates `projectDeleteInvalidations`.
 */
async function deleteProjectActionImpl(id: string): Promise<ProjectDeleteResult> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canDeleteProject) {
    throw new Error("FORBIDDEN: project delete");
  }
  if (!isUuid(id)) throw flowError(FLOW_ERROR.NOT_FOUND, "project");
  let result: ProjectDeleteResult;
  try {
    result = await projectsRepository.deleteProjectWithTasks(id, user.member.id);
  } catch (err) {
    if (err instanceof Error && err.message === "PROJECT_NOT_FOUND") throw flowError(FLOW_ERROR.NOT_FOUND, "project");
    throw err;
  }
  revalidateProjectFlow();
  return result;
}

/**
 * Restores a deleted project and exactly the tasks deleted with it (#1050):
 * admins or the person who deleted it, within `PROJECT_RESTORE_DAYS`.
 * Portal access is not restored. Errors: FORBIDDEN, NOT_FOUND, INVALID
 * (window passed), NAME_TAKEN.
 */
export async function restoreProjectAction(
  ...args: Parameters<typeof restoreProjectActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof restoreProjectActionImpl>>>> {
  return toActionResult(() => restoreProjectActionImpl(...args));
}

async function restoreProjectActionImpl(id: string): Promise<ProjectRestoreResult> {
  // Admin or the deleter: checked in the repository against the delete's history row.
  const user = await requireCapabilityUser();
  if (!isUuid(id)) throw flowError(FLOW_ERROR.NOT_FOUND, "project");
  const result = await projectsRepository.restoreProject(id, viewerOf(user));
  revalidateProjectFlow();
  return result;
}

export async function setProjectMembersAction(
  ...args: Parameters<typeof setProjectMembersActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setProjectMembersActionImpl>>>> {
  return toActionResult(() => setProjectMembersActionImpl(...args));
}

async function setProjectMembersActionImpl(
  projectId: string,
  members: Array<{ staffId: string; role?: string | null }>
): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProjectGeneral) {
    throw new Error("FORBIDDEN: project members edit");
  }
  await projectsRepository.setProjectMembers(projectId, members, user.member.id);
}

export async function setProjectContactsAction(
  ...args: Parameters<typeof setProjectContactsActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setProjectContactsActionImpl>>>> {
  return toActionResult(() => setProjectContactsActionImpl(...args));
}

async function setProjectContactsActionImpl(
  projectId: string,
  contacts: Array<{ contactId: string; role?: string | null }>
): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProjectGeneral) {
    throw new Error("FORBIDDEN: project contacts edit");
  }
  await projectsRepository.setProjectContacts(projectId, contacts);
}

const PROJECT_LINK_ERROR_MESSAGES: Record<string, string> = {
  PROJECT_LINK_TITLE_REQUIRED: "Escribe un nombre para el enlace.",
  PROJECT_LINK_URL_INVALID: "El enlace debe ser una URL válida que empiece con http:// o https://.",
  PROJECT_LINK_KIND_INVALID: "Elige si el enlace es interno o del cliente.",
};

export async function addProjectLinkAction(
  ...args: Parameters<typeof addProjectLinkActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof addProjectLinkActionImpl>>>> {
  return toActionResult(() => addProjectLinkActionImpl(...args));
}

async function addProjectLinkActionImpl(projectId: string, input: ProjectLinkInput): Promise<ProjectLink> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProtectedProjectData) {
    throw new Error("FORBIDDEN: project links edit");
  }
  try {
    const row = await projectsRepository.addProjectLink(projectId, input);
    return row;
  } catch (err) {
    const message = err instanceof Error ? PROJECT_LINK_ERROR_MESSAGES[err.message] : undefined;
    throw new Error(message ?? "No se pudo agregar el enlace.");
  }
}

export async function removeProjectLinkAction(
  ...args: Parameters<typeof removeProjectLinkActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof removeProjectLinkActionImpl>>>> {
  return toActionResult(() => removeProjectLinkActionImpl(...args));
}

async function removeProjectLinkActionImpl(projectId: string, linkId: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProtectedProjectData) {
    throw new Error("FORBIDDEN: project links edit");
  }
  await projectsRepository.removeProjectLink(projectId, linkId);
}

/** Project bitácora (comments and changes), newest first; same shape as fetchTaskHistoryAction. */
export async function fetchProjectHistoryAction(projectId: string): Promise<HistoryEvent[]> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canViewProjects) return [];
  if (!(await projectsRepository.projectExists(projectId))) return [];
  const events = await projectsRepository.listProjectHistory(projectId);
  if (canSeeAdminData(user)) return events;
  // Client and origin changes are admin-only data (BE §12, B2).
  return events.filter((event) => !event.field || !ADMIN_ONLY_HISTORY_FIELDS.has(event.field));
}

/** Project history fields non-administrators never see (BE §12, B2). */
const ADMIN_ONLY_HISTORY_FIELDS = new Set(["clientId", "origin", "originStaffId"]);

/** Adds a comment to the project bitácora. Throws FORBIDDEN, EMPTY or NOT_FOUND. */
export async function addProjectCommentAction(
  ...args: Parameters<typeof addProjectCommentActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof addProjectCommentActionImpl>>>> {
  return toActionResult(() => addProjectCommentActionImpl(...args));
}

async function addProjectCommentActionImpl(projectId: string, text: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canViewProjects) throw new Error("FORBIDDEN");
  const comment = (text ?? "").trim();
  if (!comment) throw new Error("EMPTY");
  if (!(await projectsRepository.projectExists(projectId))) throw new Error("NOT_FOUND");
  await projectsRepository.addProjectComment(projectId, comment, user.member.id);
}

// ── Current tramo and espacios (project flow BE §7.3) ───────────────────────

const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

/**
 * Makes an already started tramo the project's current one (BE §7.3).
 * `canChangeProjectStage`. A tramo with no stage row gives NOT_STARTED, except
 * for an admin on a project without a current tramo ("Asignar tramo"): that
 * opens the stage through `startTramo` with `stageOnly` (no fases, no tasks).
 * Errors: FORBIDDEN, NOT_FOUND, NOT_STARTED.
 */
export async function setProjectCurrentTramoAction(
  ...args: Parameters<typeof setProjectCurrentTramoActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setProjectCurrentTramoActionImpl>>>> {
  return toActionResult(() => setProjectCurrentTramoActionImpl(...args));
}

async function setProjectCurrentTramoActionImpl(id: string, workflowId: string): Promise<ProjectDetail> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canChangeProjectStage) throw new Error("FORBIDDEN");
  if (!isUuid(id) || !isUuid(workflowId)) throw new Error("NOT_FOUND");

  let row: ProjectDetail;
  try {
    row = await projectsRepository.setProjectCurrentTramo(id, workflowId, user.member.id);
  } catch (err) {
    if (!(err instanceof Error && err.message === "NOT_STARTED" && canSeeAdminData(user))) throw err;
    row = await projectsRepository.assignProjectTramo(id, workflowId, user.member.id);
  }
  revalidateProjectFlow();
  return scopeProjectDto(row, viewerScopeOf(user));
}

/** Signed-in user allowed to edit the project's general data (espacios); FORBIDDEN otherwise. */
async function requireProjectEditor() {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProjectGeneral) throw flowError(FLOW_ERROR.FORBIDDEN);
  return user;
}

/** By `sortOrder`, with live task counts. `canViewProjects`. */
export async function fetchProjectSpacesAction(projectId: string): Promise<ProjectSpace[]> {
  const caps = await requireProjectsCapabilities();
  if (!caps.canViewProjects) return [];
  return projectSpacesRepository.listSpaces(parseInput(UuidSchema, projectId));
}

/** Appended last. `canEditProjectGeneral`. Errors: FORBIDDEN, NAME_TAKEN, EMPTY, NOT_FOUND. */
export async function createProjectSpaceAction(
  ...args: Parameters<typeof createProjectSpaceActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createProjectSpaceActionImpl>>>> {
  return toActionResult(() => createProjectSpaceActionImpl(...args));
}

async function createProjectSpaceActionImpl(projectId: string, name: string): Promise<ProjectSpace> {
  await requireProjectEditor();
  const id = parseInput(UuidSchema, projectId);
  const row = await projectSpacesRepository.createSpace(id, parseInput(ProjectSpaceNameSchema, name));
  return row;
}

/** Errors: FORBIDDEN, NAME_TAKEN, EMPTY, NOT_FOUND. */
export async function renameProjectSpaceAction(
  ...args: Parameters<typeof renameProjectSpaceActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof renameProjectSpaceActionImpl>>>> {
  return toActionResult(() => renameProjectSpaceActionImpl(...args));
}

async function renameProjectSpaceActionImpl(id: string, name: string): Promise<ProjectSpace> {
  await requireProjectEditor();
  const spaceId = parseInput(UuidSchema, id);
  const row = await projectSpacesRepository.renameSpace(spaceId, parseInput(ProjectSpaceNameSchema, name));
  return row;
}

/** Errors: FORBIDDEN, NOT_FOUND. */
export async function reorderProjectSpacesAction(
  ...args: Parameters<typeof reorderProjectSpacesActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof reorderProjectSpacesActionImpl>>>> {
  return toActionResult(() => reorderProjectSpacesActionImpl(...args));
}

async function reorderProjectSpacesActionImpl(projectId: string, orderedIds: string[]): Promise<void> {
  await requireProjectEditor();
  const id = parseInput(UuidSchema, projectId);
  await projectSpacesRepository.reorderSpaces(id, parseInput(OrderedIdsSchema, orderedIds));
}

/** Its tasks keep their fase and lose the espacio. Errors: FORBIDDEN, NOT_FOUND. */
export async function deleteProjectSpaceAction(
  ...args: Parameters<typeof deleteProjectSpaceActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deleteProjectSpaceActionImpl>>>> {
  return toActionResult(() => deleteProjectSpaceActionImpl(...args));
}

async function deleteProjectSpaceActionImpl(id: string): Promise<void> {
  const user = await requireProjectEditor();
  await projectSpacesRepository.deleteSpace(parseInput(UuidSchema, id), user.member.id);
}

/**
 * Portfolio metrics per visible project (redesign BE §7.12): real vs plan,
 * deviation, budget (admins only), open / overdue, next delivery, 7-day
 * series. Same scope as `fetchProjectsAction`. Without `canSeeAdminData`,
 * admin tasks are not counted and the budget is null; the next delivery never
 * names an admin task.
 */
export async function fetchProjectsPortfolioAction(): Promise<PortfolioRow[]> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canViewProjects) return [];
  return portfolioFor(user);
}
