import "server-only";

import { getStaffFilesProject, listStaffProjectFiles } from "@/lib/google/staff-files-app";

/**
 * Entry count of the folder the Archivos tab opens on (a Drive listing). The
 * server-rendered project tabs still pass it to `loadProjectTabShell` until
 * their phase moves `counts.archivos` onto `proyectos.archivos(id, null)`;
 * `getProyectoShell` never calls it.
 */
export async function projectRootFilesCount(staffId: string, projectId: string): Promise<number> {
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
