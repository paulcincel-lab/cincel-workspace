"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import type {
  ApplyWorkflowPreview,
  ProjectDetail,
  ProjectInput,
  ProjectLink,
  ProjectLinkInput,
  ProjectListItem,
} from "@/lib/types/core";
import type { ProjectFilters } from "@/lib/repositories/projects-repository";

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
  revalidateProyectos(id);
  return row;
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
