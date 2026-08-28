/**
 * Projects data access.
 *
 * Reads/writes go to Postgres via the Server Actions in
 * `lib/actions/projects-actions.ts` (Drizzle + session authz). No localStorage:
 * pages server-render initial data and hydrate via `fetchProjects()`;
 * `getProjectsSnapshot()` returns the built-in mock set only as a
 * pre-hydration seed for synchronous callers.
 */
import { projects as baseProjects } from "@/lib/data/projects";
import {
  fetchProjectsAction,
  saveProjectsAction,
  deleteProjectAction,
} from "@/lib/actions/projects-actions";

export type Project = (typeof baseProjects)[number];

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
