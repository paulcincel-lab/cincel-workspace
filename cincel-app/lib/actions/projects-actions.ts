"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { retryProjectFolders, syncProjectFolderName, syncProjectFolders } from "@/lib/google/project-folders-app";
import { notImplemented } from "@/lib/project-flow/not-implemented";
import { FLOW_ERROR, flowError } from "@/lib/project-flow/errors";
import * as projectSpacesRepository from "@/lib/repositories/project-spaces-repository";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import type {
  ApplyWorkflowPreview,
  HistoryEvent,
  ProjectDetail,
  ProjectInput,
  ProjectLink,
  ProjectLinkInput,
  ProjectListItem,
  ProjectSpace,
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

export async function fetchProjectsAction(filters: ProjectFilters = {}): Promise<ProjectListItem[]> {
  const caps = await requireProjectsCapabilities();
  if (!caps.canViewProjects) return [];
  return projectsRepository.listProjects(filters);
}

export async function fetchProjectAction(id: string): Promise<ProjectDetail | null> {
  const caps = await requireProjectsCapabilities();
  if (!caps.canViewProjects) return null;
  return projectsRepository.getProject(id);
}

export async function createProjectAction(input: ProjectInput): Promise<ProjectDetail> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canCreateProject) {
    throw new Error("FORBIDDEN: project create");
  }
  const row = await projectsRepository.createProject(input, user.member.id);
  // Drive runs after the response; a failure leaves the project with drive_folder_status = failed.
  after(() => syncProjectFolders(row.id));
  revalidateProyectos(row.id);
  return row;
}

export async function updateProjectAction(
  id: string,
  patch: Partial<ProjectInput>
): Promise<ProjectDetail> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProjectGeneral) {
    throw new Error("FORBIDDEN: project edit");
  }
  const row = await projectsRepository.updateProject(id, patch, user.member.id);
  if (patch.name !== undefined || patch.code !== undefined) after(() => syncProjectFolderName(id));
  revalidateProyectos(id);
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

export async function setProjectStageAction(id: string, workflowId: string): Promise<ProjectDetail> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canChangeProjectStage) {
    throw new Error("FORBIDDEN: project stage change");
  }
  const row = await projectsRepository.setProjectStage(id, workflowId, user.member.id);
  revalidateProyectos(id);
  return row;
}

/** Sets every stage the project is in (#435); the most advanced becomes the primary one. */
export async function setProjectStagesAction(id: string, workflowIds: string[]): Promise<ProjectDetail> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canChangeProjectStage) {
    throw new Error("FORBIDDEN: project stage change");
  }
  const row = await projectsRepository.setProjectStages(id, workflowIds, user.member.id);
  revalidateProyectos(id);
  return row;
}

export async function archiveProjectAction(id: string, status: "completado" | "cancelado"): Promise<ProjectDetail> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canArchiveProject) {
    throw new Error("FORBIDDEN: project archive");
  }
  const row = await projectsRepository.updateProject(id, { status }, user.member.id);
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
  const caps = await requireProjectsCapabilities();
  if (!caps.canViewProjects) return [];
  if (!(await projectsRepository.projectExists(projectId))) return [];
  return projectsRepository.listProjectHistory(projectId);
}

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

export async function previewApplyWorkflowAction(
  projectId: string,
  workflowId: string
): Promise<ApplyWorkflowPreview> {
  const caps = await requireProjectsCapabilities();
  if (!caps.canEditProjectGeneral) throw new Error("FORBIDDEN: apply workflow preview");
  return projectsRepository.previewApplyWorkflow(projectId, workflowId);
}

export async function applyWorkflowAction(
  projectId: string,
  workflowId: string,
  options: { managerId?: string | null; setAsStage?: boolean } = {}
) {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProjectGeneral) {
    throw new Error("FORBIDDEN: apply workflow");
  }
  const created = await projectsRepository.applyWorkflow(projectId, workflowId, user.member.id, options);
  revalidateProyectos(projectId);
  revalidatePath("/tareas");
  return created;
}

// ── Current tramo and espacios (project flow BE §7.3) ───────────────────────

/**
 * Replaces setProjectStageAction / setProjectStagesAction.
 * `canChangeProjectStage`. Errors: FORBIDDEN, NOT_FOUND, NOT_STARTED.
 */
export async function setProjectCurrentTramoAction(id: string, workflowId: string): Promise<ProjectDetail> {
  return notImplemented("setProjectCurrentTramoAction", id, workflowId);
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
