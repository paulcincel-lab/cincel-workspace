/**
 * Projects data access.
 *
 * Phase 2: reads/writes go to Postgres via the Server Actions in
 * `lib/actions/projects-actions.ts` (Drizzle + session authz). This module keeps
 * its historical function names/signatures so existing callers don't change.
 *
 * `getProjectsSnapshot()` still returns the built-in mock set: several callers
 * (tasks-linking, PresaleTable, tareas) read it synchronously for project name
 * lookups and have no async hydration path yet. Pages that own project data
 * (proyectos, clientes, equipo) call `fetchProjects()` and overlay the result.
 */
import { projects as baseProjects } from "@/lib/data/projects";
import {
  fetchProjectsAction,
  saveProjectsAction,
  deleteProjectAction,
} from "@/lib/actions/projects-actions";

export type Project = (typeof baseProjects)[number];

/** @deprecated dead key kept so optimistic `writeStorage` calls still compile. */
export const PROJECTS_STORAGE_KEY = "cincel.projects.data.v1";

export function getProjectsSnapshot(): Project[] {
  return baseProjects;
}

export async function fetchProjects(): Promise<Project[]> {
  return fetchProjectsAction();
}

export async function saveProjects(projects: Project[]): Promise<void> {
  await saveProjectsAction(projects);
}

export async function deleteProject(projectLegacyId: number): Promise<void> {
  await deleteProjectAction(projectLegacyId);
}
