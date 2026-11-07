"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canSeeAdminData, resolveProjectsCapabilities } from "@/lib/auth/permissions";
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

async function requireProjectsCapabilities() {
  return resolveProjectsCapabilities(await requireCapabilityUser());
}

function revalidateProyectos(id?: string) {
  revalidatePath("/proyectos");
  if (id) revalidatePath(`/proyectos/${id}/ficha`);
}

/** Changes that move a project between tramos also show on Actividades, Dashboard and Tablero (BE §7.3). */
function revalidateProjectFlow(id: string) {
  revalidateProyectos(id);
  revalidatePath("/actividades", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/tablero");
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

/** Create/update revalidation (BE §7.3): Proyectos, the ficha, Actividades layout, Dashboard and Tablero. */
function revalidateProjectEdit(id: string) {
  revalidateProyectos(id);
  revalidatePath("/actividades", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/tablero");
}

/** Patch keys only administrators may send (BE §7.3). */
const ADMIN_ONLY_PROJECT_KEYS = ["clientId", "origin", "originStaffId"] as const;

const viewerOf = (user: AuthenticatedUser): ViewerScope => ({ staffId: user.member.id, isAdmin: canSeeAdminData(user) });

/**
 * Creates a project with only a name (BE §9.4). Older callers may still pass
 * a full `ProjectInput`; only `name` is read. `canCreateProject`. Errors:
 * FORBIDDEN, EMPTY, NAME_TAKEN.
 */
export async function createProjectAction(input: ProjectCreateInput | ProjectInput): Promise<ProjectDetail> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canCreateProject) {
    throw new Error("FORBIDDEN: project create");
  }
  const row = await projectsRepository.createProject({ name: input?.name }, user.member.id);
  // Drive runs after the response; no client yet, so only the internal folders.
  // A failure leaves the project with drive_folder_status = failed.
  after(() => syncProjectFolders(row.id));
  revalidateProjectEdit(row.id);
  return row;
}

/** Codes the create sheet shows as copy instead of the generic error. */
const CREATE_PROJECT_CODES = new Set(["FORBIDDEN", "EMPTY", "NAME_TAKEN"]);

/**
 * `createProjectAction` for the create sheet. Production builds hide the
 * message of an error thrown by a Server Action, so the known codes come back
 * as a value the sheet can turn into copy. Other errors still throw.
 */
export async function submitProjectCreateAction(
  input: ProjectCreateInput
): Promise<{ ok: true; project: ProjectDetail } | { ok: false; error: string }> {
  try {
    return { ok: true, project: await createProjectAction(input) };
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
  revalidateProjectEdit(id);
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
  revalidateProyectos(projectId);
  if (result.status === "ready") return { ok: true, status: "ready" };
  return { ok: true, status: "failed", error: result.error };
}

export async function archiveProjectAction(id: string, status: "completado" | "cancelado"): Promise<ProjectDetail> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canArchiveProject) {
    throw new Error("FORBIDDEN: project archive");
  }
  const row = await projectsRepository.updateProject(id, { status }, user.member.id, viewerOf(user));
  revalidateProyectos(id);
  return row;
}

export async function deleteProjectAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canDeleteProject) {
    throw new Error("FORBIDDEN: project delete");
  }
  await projectsRepository.softDeleteProject(id, user.member.id);
  revalidateProyectos(id);
}

export async function setProjectMembersAction(
  projectId: string,
  members: Array<{ staffId: string; role?: string | null }>
): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProjectGeneral) {
    throw new Error("FORBIDDEN: project members edit");
  }
  await projectsRepository.setProjectMembers(projectId, members, user.member.id);
  revalidateProyectos(projectId);
}

export async function setProjectContactsAction(
  projectId: string,
  contacts: Array<{ contactId: string; role?: string | null }>
): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProjectGeneral) {
    throw new Error("FORBIDDEN: project contacts edit");
  }
  await projectsRepository.setProjectContacts(projectId, contacts);
  revalidateProyectos(projectId);
}

const PROJECT_LINK_ERROR_MESSAGES: Record<string, string> = {
  PROJECT_LINK_TITLE_REQUIRED: "Escribe un nombre para el enlace.",
  PROJECT_LINK_URL_INVALID: "El enlace debe ser una URL válida que empiece con http:// o https://.",
  PROJECT_LINK_KIND_INVALID: "Elige si el enlace es interno o del cliente.",
};

export async function addProjectLinkAction(projectId: string, input: ProjectLinkInput): Promise<ProjectLink> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProtectedProjectData) {
    throw new Error("FORBIDDEN: project links edit");
  }
  try {
    const row = await projectsRepository.addProjectLink(projectId, input);
    revalidateProyectos(projectId);
    return row;
  } catch (err) {
    const message = err instanceof Error ? PROJECT_LINK_ERROR_MESSAGES[err.message] : undefined;
    throw new Error(message ?? "No se pudo agregar el enlace.");
  }
}

export async function removeProjectLinkAction(projectId: string, linkId: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProtectedProjectData) {
    throw new Error("FORBIDDEN: project links edit");
  }
  await projectsRepository.removeProjectLink(projectId, linkId);
  revalidateProyectos(projectId);
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
export async function addProjectCommentAction(projectId: string, text: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canViewProjects) throw new Error("FORBIDDEN");
  const comment = (text ?? "").trim();
  if (!comment) throw new Error("EMPTY");
  if (!(await projectsRepository.projectExists(projectId))) throw new Error("NOT_FOUND");
  await projectsRepository.addProjectComment(projectId, comment, user.member.id);
  revalidateProyectos(projectId);
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
export async function setProjectCurrentTramoAction(id: string, workflowId: string): Promise<ProjectDetail> {
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
  revalidateProjectFlow(id);
  return scopeProjectDto(row, viewerScopeOf(user));
}

/** Signed-in user allowed to edit the project's general data (espacios); FORBIDDEN otherwise. */
async function requireProjectEditor() {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProjectGeneral) throw flowError(FLOW_ERROR.FORBIDDEN);
  return user;
}

/** Espacios show on the ficha and filter the Actividades views. Without a project id, every ficha. */
function revalidateSpaces(projectId?: string) {
  if (projectId) revalidatePath(`/proyectos/${projectId}/ficha`);
  else revalidatePath("/proyectos", "layout");
  revalidatePath("/actividades", "layout");
}

/** By `sortOrder`, with live task counts. `canViewProjects`. */
export async function fetchProjectSpacesAction(projectId: string): Promise<ProjectSpace[]> {
  const caps = await requireProjectsCapabilities();
  if (!caps.canViewProjects) return [];
  return projectSpacesRepository.listSpaces(parseInput(UuidSchema, projectId));
}

/** Appended last. `canEditProjectGeneral`. Errors: FORBIDDEN, NAME_TAKEN, EMPTY, NOT_FOUND. */
export async function createProjectSpaceAction(projectId: string, name: string): Promise<ProjectSpace> {
  await requireProjectEditor();
  const id = parseInput(UuidSchema, projectId);
  const row = await projectSpacesRepository.createSpace(id, parseInput(ProjectSpaceNameSchema, name));
  revalidateSpaces(id);
  return row;
}

/** Errors: FORBIDDEN, NAME_TAKEN, EMPTY, NOT_FOUND. */
export async function renameProjectSpaceAction(id: string, name: string): Promise<ProjectSpace> {
  await requireProjectEditor();
  const spaceId = parseInput(UuidSchema, id);
  const row = await projectSpacesRepository.renameSpace(spaceId, parseInput(ProjectSpaceNameSchema, name));
  revalidateSpaces(row.projectId);
  return row;
}

/** Errors: FORBIDDEN, NOT_FOUND. */
export async function reorderProjectSpacesAction(projectId: string, orderedIds: string[]): Promise<void> {
  await requireProjectEditor();
  const id = parseInput(UuidSchema, projectId);
  await projectSpacesRepository.reorderSpaces(id, parseInput(OrderedIdsSchema, orderedIds));
  revalidateSpaces(id);
}

/** Its tasks keep their fase and lose the espacio. Errors: FORBIDDEN, NOT_FOUND. */
export async function deleteProjectSpaceAction(id: string): Promise<void> {
  const user = await requireProjectEditor();
  await projectSpacesRepository.deleteSpace(parseInput(UuidSchema, id), user.member.id);
  revalidateSpaces();
}
