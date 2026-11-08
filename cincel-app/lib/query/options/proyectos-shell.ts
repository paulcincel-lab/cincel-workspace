import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { getProyectoShell } from "@/lib/actions/page-data/proyectos-shell-actions";
import { STALE, qk } from "@/lib/query/keys";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import type { StaffFilesResult } from "@/lib/types/workspace-access";

/**
 * `counts.archivos` from the cached root listing (`proyectos.archivos(id, null)`)
 * when there is one; the action makes no Drive call and sends 0.
 */
export function withCachedArchivosCount(client: QueryClient, shell: ProjectTabShell | null): ProjectTabShell | null {
  if (!shell) return shell;
  const root = client.getQueryData<StaffFilesResult>(qk.proyectos.archivos(shell.project.id, null));
  if (!root || root.status !== "ok") return shell;
  return { ...shell, counts: { ...shell.counts, archivos: root.items.length } };
}

/**
 * The project header and tab counts (`qk.proyectos.shell(id)`, plan §5
 * Phase 1b), 30 s stale. Null when the viewer can't see the project.
 * `initial` is the server-rendered shell.
 */
export function proyectoShellOptions(id: string, initial?: ProjectTabShell | null) {
  return queryOptions<ProjectTabShell | null>({
    queryKey: qk.proyectos.shell(id),
    queryFn: async ({ client }) => withCachedArchivosCount(client, await getProyectoShell({ id })),
    staleTime: STALE.screen,
    ...(initial !== undefined ? { initialData: initial } : {}),
  });
}
