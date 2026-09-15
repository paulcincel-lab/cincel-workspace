"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import type {
  ApplyWorkflowPreview,
  DriveFileInput,
  ProjectDetail,
  ProjectInput,
  ProjectLink,
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

export async function setProjectLinkAction(
  projectId: string,
  kind: string,
  link: { url: string; title?: string | null; drive?: DriveFileInput | null }
): Promise<ProjectLink | null> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canEditProtectedProjectData) {
    throw new Error("FORBIDDEN: project links edit");
  }
  const row = await projectsRepository.setProjectLink(projectId, kind, link);
  revalidateProyectos(projectId);
  return row;
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
