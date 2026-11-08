import type { Query, QueryClient } from "@tanstack/react-query";

import type { ProyectoArchivosData } from "@/lib/loaders/proyectos";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import { qk } from "@/lib/query/keys";

/**
 * Cache helpers of the Archivos and Clientes tabs (Query Migration 5d, #962):
 * stale time, shell seeding and the keys their mutations invalidate. No
 * action imports, so the files browser and its pure view helpers stay light.
 */

/** Drive listings change rarely and cost a Drive call: 3 min. */
export const ARCHIVOS_STALE_MS = 3 * 60_000;

/** Every folder listing of the project: `['proyectos', id, 'archivos']` (prefix of `qk.proyectos.archivos`). */
export function proyectoArchivosPrefix(id: string) {
  return [...qk.proyectos.detail(id), "archivos"] as const;
}

/** The root listing's entry count, or null when the listing isn't readable. */
export function archivosRootCount(data: ProyectoArchivosData | undefined): number | null {
  if (!data || data.kind !== "ok" || data.result.status !== "ok") return null;
  return data.result.items.length;
}

/**
 * Writes the root listing's count into the cached shell (`counts.archivos`),
 * so the shell never lists Drive itself. The Archivos query function and the
 * server prefetch (before dehydrating) both call it.
 */
export function seedArchivosCount(client: QueryClient, id: string, data: ProyectoArchivosData | undefined): void {
  const archivos = archivosRootCount(data);
  if (archivos === null) return;
  client.setQueryData<ProjectTabShell | null>(qk.proyectos.shell(id), (shell) =>
    shell ? { ...shell, counts: { ...shell.counts, archivos } } : shell,
  );
}

/**
 * Every project's Clientes keys (`['proyectos', <id>, 'clientes', …]`, the
 * activity included): disabling or enabling a portal user changes their rows
 * on all of their projects.
 */
export function isClientesQuery(query: Pick<Query, "queryKey">): boolean {
  return query.queryKey[0] === "proyectos" && query.queryKey[2] === "clientes";
}

/**
 * After an invite or a revoke: the Clientes tab (its prefix also covers
 * `clientesActivity(id)`, so the activity refetches once) and the shell's
 * Clientes count.
 */
export function clientesAccessKeys(id: string) {
  return [qk.proyectos.tab(id, "clientes"), qk.proyectos.shell(id)] as const;
}

/** After Reintentar carpeta: every folder listing, the Resumen files and the shell count. */
export function retryFolderKeys(id: string) {
  return [proyectoArchivosPrefix(id), qk.proyectos.resumen(id), qk.proyectos.shell(id)] as const;
}
