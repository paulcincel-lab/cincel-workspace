import "server-only";

import { cache } from "react";

import type { ProjectTabsProps } from "@/components/proyectos/ProjectTabs";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveActivitiesCapabilities, resolvePortalCapabilities, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { projectRootFilesCount } from "@/lib/projects/project-root-files-count";
import { countProjectPortalAccess } from "@/lib/repositories/portal-access-repository";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import { countProjectTasks } from "@/lib/repositories/tasks-repository";
import type { ProjectDetail } from "@/lib/types/core";

/** What the Archivos, Clientes and Ficha tabs pass to `ProjectTabs` (everything but `active`). */
export type ProjectTabShell = Omit<ProjectTabsProps, "active" | "showEstilo"> & { detail: ProjectDetail };

/**
 * The project as `viewer` sees it (null when it doesn't exist or is deleted),
 * deduped per request with React `cache()`: the tab shell and the tab body
 * read it once. Primitive arguments so the cache key matches across calls.
 */
export const getProjectForViewer = cache(
  (projectId: string, staffId: string, isAdmin: boolean): Promise<ProjectDetail | null> =>
    projectsRepository.getProject(projectId, { staffId, isAdmin }),
);

/** `fetchProjectAction` without the session read: `canViewProjects`, then the scoped project. */
async function readProject(projectId: string, user: AuthenticatedUser): Promise<ProjectDetail | null> {
  if (!resolveProjectsCapabilities(user).canViewProjects) return null;
  const viewer = viewerScopeOf(user);
  try {
    return await getProjectForViewer(projectId, viewer.staffId, viewer.isAdmin);
  } catch {
    // Unknown id format: not found.
    return null;
  }
}

/** Live top-level tasks (subtasks live inside their parent), the Resumen tab count. 0 without `canViewActivities`. */
async function tareasCount(projectId: string, user: AuthenticatedUser): Promise<number> {
  if (!resolveActivitiesCapabilities(user).canViewActivities) return 0;
  try {
    return await countProjectTasks(projectId, viewerScopeOf(user), { topLevel: true });
  } catch {
    return 0;
  }
}

async function clientesCount(projectId: string, canManagePortal: boolean, known?: number): Promise<number> {
  if (!canManagePortal) return 0;
  if (known !== undefined) return known;
  try {
    return await countProjectPortalAccess(projectId);
  } catch {
    return 0;
  }
}

/**
 * Header + tab data of the redesigned project shell (redesign FE §3.5) with
 * `COUNT(*)` reads only and no Drive call: the project (null when it doesn't
 * exist or the viewer can't see it), `canManagePortal` (`portal.manageAccess`)
 * and the tab counts. `archivos` is `opts.archivos` when the caller knows it,
 * else 0: on the client it comes from `proyectos.archivos(id, null)` (5d).
 * At most 4 statements: the project (2), the tasks count and the portal
 * access count. Backs `getProyectoShell`.
 */
export async function loadProjectShell(
  projectId: string,
  user: AuthenticatedUser,
  opts: { archivos?: number | (() => Promise<number>); clientes?: number } = {},
): Promise<ProjectTabShell | null> {
  const detail = await readProject(projectId, user);
  if (!detail) return null;

  const canManagePortal = resolvePortalCapabilities(user).manageAccess;
  const [tareas, clientes, archivos] = await Promise.all([
    tareasCount(detail.id, user),
    clientesCount(detail.id, canManagePortal, opts.clientes),
    typeof opts.archivos === "function" ? opts.archivos() : Promise.resolve(opts.archivos ?? 0),
  ]);

  return {
    detail,
    project: {
      id: detail.id,
      name: detail.name,
      etapa: detail.currentWorkflow,
      projectType: detail.projectType,
      addressCity: detail.addressCity,
      manager: detail.manager,
    },
    counts: { tareas, archivos, clientes },
    canManagePortal,
  };
}

/**
 * The shell for the server-rendered `/proyectos/[id]/*` tabs: `loadProjectShell`
 * plus, when the caller didn't pass `archivos`, the Drive count of the folder
 * the Archivos tab opens on (as before, until those tabs read
 * `proyectos.archivos`). A caller that already listed the folder or the
 * Clientes rows passes the count in.
 */
export async function loadProjectTabShell(
  projectId: string,
  user: AuthenticatedUser,
  opts: { archivos?: number; clientes?: number } = {},
): Promise<ProjectTabShell | null> {
  return loadProjectShell(projectId, user, {
    clientes: opts.clientes,
    archivos: opts.archivos ?? (() => projectRootFilesCount(user.member.id, projectId)),
  });
}
