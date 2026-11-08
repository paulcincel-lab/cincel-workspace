import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { loadProjectShell, type ProjectTabShell } from "@/lib/projects/project-tab-shell";

/**
 * `proyectos.shell(id)` loader (Query Migration 1b, #954): `(user, input) =>
 * data`. `getProyectoShell` calls it after the session check and a server
 * prefetch calls it directly. The project read re-checks `canViewProjects`,
 * so an out-of-scope or deleted project is null. No Drive call: `archivos`
 * is 0 here and the client fills it from `proyectos.archivos(id, null)`.
 */
export async function loadProyectoShell(user: AuthenticatedUser, input: { id: string }): Promise<ProjectTabShell | null> {
  return loadProjectShell(input.id, user);
}
