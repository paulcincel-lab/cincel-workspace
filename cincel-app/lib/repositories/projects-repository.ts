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
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { projects as baseProjects } from "@/lib/data/projects";
import {
  fetchProjectsAction,
  saveProjectsAction,
  deleteProjectAction,
} from "@/lib/actions/projects-actions";

export type Project = (typeof baseProjects)[number];

export const PROJECTS_STORAGE_KEY = "cincel.projects.data.v1";

/**
 * Mirror the full project list into localStorage. Postgres is the source of
 * truth (Phase 2), but several synchronous readers — the proyectos ficha page,
 * tareas, PresaleTable — still read this key directly and have no async path.
 * Callers that own the full list (use-projects-data) keep it fresh.
 */
export function mirrorProjectsToStorage(projects: Project[]): void {
  if (typeof window !== "undefined" && projects.length > 0) {
    writeStorage(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  }
}

export function getProjectsSnapshot(): Project[] {
  if (typeof window === "undefined") return baseProjects;
  const stored = readStorage(PROJECTS_STORAGE_KEY);
  if (!stored) return baseProjects;
  try {
    const parsed = JSON.parse(stored) as Project[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : baseProjects;
  } catch {
    return baseProjects;
  }
}

export async function fetchProjects(): Promise<Project[]> {
  const projects = await fetchProjectsAction();
  mirrorProjectsToStorage(projects);
  return projects;
}

export async function saveProjects(projects: Project[]): Promise<void> {
  await saveProjectsAction(projects);
}

export async function deleteProject(projectLegacyId: number): Promise<void> {
  await deleteProjectAction(projectLegacyId);
}
