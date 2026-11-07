import "server-only";

import type { ProjectTabsProps } from "@/components/proyectos/ProjectTabs";
import { listProjectPortalAccessAction } from "@/lib/actions/portal-actions";
import { fetchProjectAction } from "@/lib/actions/projects-actions";
import { fetchTasksAction } from "@/lib/actions/tasks-actions";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolvePortalCapabilities } from "@/lib/auth/permissions";
import { getStaffFilesProject, listStaffProjectFiles } from "@/lib/google/staff-files-app";
import type { ProjectDetail } from "@/lib/types/core";

/** What the Archivos, Clientes and Ficha tabs pass to `ProjectTabs` (everything but `active`). */
export type ProjectTabShell = Omit<ProjectTabsProps, "active" | "showEstilo"> & { detail: ProjectDetail };

async function rootFilesCount(staffId: string, projectId: string): Promise<number> {
  try {
    const project = await getStaffFilesProject(projectId);
    if (!project) return 0;
    const result = await listStaffProjectFiles(staffId, project, null);
    return result.status === "ok" ? result.items.length : 0;
  } catch {
    // A Drive outage must not take the tab down; the count just reads 0.
    return 0;
  }
}

async function clientesCount(projectId: string, canManagePortal: boolean, known?: number): Promise<number> {
  if (!canManagePortal) return 0;
  if (known !== undefined) return known;
  try {
    return (await listProjectPortalAccessAction(projectId)).length;
  } catch {
    return 0;
  }
}

/**
 * Header + tab data of the redesigned project shell (redesign FE §3.5) for
 * `/proyectos/[id]/{archivos,clientes,ficha}`: the project (null when it
 * doesn't exist or the viewer can't see it), `canManagePortal`
 * (`portal.manageAccess`) and the tab counts. `archivos` is the entry count of
 * the folder the Archivos tab opens on; a caller that already listed it passes
 * it in, and likewise the Clientes count (read only with `portal.manageAccess`).
 */
export async function loadProjectTabShell(
  projectId: string,
  user: AuthenticatedUser,
  opts: { archivos?: number; clientes?: number } = {},
): Promise<ProjectTabShell | null> {
  let detail: ProjectDetail | null = null;
  try {
    detail = await fetchProjectAction(projectId);
  } catch {
    // Unknown id format or no project access: not found.
  }
  if (!detail) return null;

  const canManagePortal = resolvePortalCapabilities(user).manageAccess;
  const [tareas, clientes, archivos] = await Promise.all([
    // Same count as the Resumen tab: live top-level tasks (subtasks live inside their parent).
    fetchTasksAction({ projectId: detail.id })
      .then((rows) => rows.filter((task) => !task.parentTaskId && !task.archived).length)
      .catch(() => 0),
    clientesCount(detail.id, canManagePortal, opts.clientes),
    opts.archivos !== undefined ? Promise.resolve(opts.archivos) : rootFilesCount(user.member.id, detail.id),
  ]);

  return {
    detail,
    project: {
      id: detail.id,
      name: detail.name,
      tramo: detail.currentWorkflow,
      projectType: detail.projectType,
      addressCity: detail.addressCity,
      manager: detail.manager,
    },
    counts: { tareas, archivos, clientes },
    canManagePortal,
  };
}
