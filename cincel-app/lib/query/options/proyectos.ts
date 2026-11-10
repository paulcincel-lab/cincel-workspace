import { infiniteQueryOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { getProyectoFichaData, getProyectoHistoryPage } from "@/lib/actions/page-data/proyectos-actions";
import type { ProyectoFichaData } from "@/lib/loaders/proyectos";
import { STALE, qk } from "@/lib/query/keys";
import type { HistoryPage } from "@/lib/repositories/history-repository";
// Cronograma (5c, #961)
import { getProyectoCronogramaData } from "@/lib/actions/page-data/proyectos-actions";
import type { ScheduleViewData } from "@/lib/actions/schedule-actions";
// Archivos and Clientes (5d, #962)
import {
  getProyectoArchivosData,
  getProyectoClientesActivity,
  getProyectoClientesData,
} from "@/lib/actions/page-data/proyectos-actions";
import type { ProyectoArchivosData, ProyectoClientesData } from "@/lib/loaders/proyectos";
import { ARCHIVOS_STALE_MS, seedArchivosCount } from "@/lib/query/options/proyectos-archivos-clientes";
import type { PortalActivityRow } from "@/lib/types/portal";
// List, Resumen and Tareas (5a, #959)
import {
  getProyectoResumenData,
  getProyectoTareasData,
  getProyectosPageData,
} from "@/lib/actions/page-data/proyectos-actions";
import type { ProyectoTareasData, ProyectosPageData } from "@/lib/loaders/proyectos";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import type { ProjectSummaryInput } from "@/lib/proyectos/project-summary";
// Resumen Analítico quick-add hint (#997)
import { getProyectoAssigneeSuggestion } from "@/lib/actions/page-data/proyectos-actions";
import type { AssigneeSuggestion } from "@/lib/proyectos/assignee-suggestion";

/**
 * `queryOptions` for the Proyectos screens (Query Migration Phase 5), 30 s
 * stale. The server prefetch calls the loaders under the same keys.
 */

// ── Ficha (5b, #960) ─────────────────────────────────────────────────────────

/**
 * Seeds the keys the ficha payload also answers (`catalog.projectSpaces(id)`
 * and `qk.importData('project', id)`), so the cards that read them make no
 * call and later invalidations stay targeted. The server prefetch calls it
 * too, before dehydrating.
 */
export function seedFichaKeys(client: QueryClient, id: string, data: ProyectoFichaData | null): void {
  if (!data) return;
  client.setQueryData(qk.catalog.projectSpaces(id), data.spaces);
  client.setQueryData(qk.importData("project", id), data.importData);
}

/** `qk.proyectos.tab(id, 'ficha')`: null when the viewer can't see the project. */
export function proyectoFichaOptions(id: string) {
  return queryOptions<ProyectoFichaData | null>({
    queryKey: qk.proyectos.tab(id, "ficha"),
    queryFn: async ({ client }) => {
      const data = await getProyectoFichaData({ id });
      seedFichaKeys(client, id, data);
      return data;
    },
    staleTime: STALE.screen,
  });
}

/**
 * `qk.proyectos.history(id)`: the Bitácora, newest first, 50 events per page;
 * "Ver más" loads the next page.
 */
export function proyectoHistoryOptions(id: string) {
  return infiniteQueryOptions({
    queryKey: qk.proyectos.history(id),
    queryFn: ({ pageParam }: { pageParam: string | null }): Promise<HistoryPage> =>
      getProyectoHistoryPage({ id, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: HistoryPage) => last.nextCursor,
    staleTime: STALE.screen,
  });
}

// ── Cronograma and Reporte (5c, #961) ────────────────────────────────────────

/**
 * `qk.proyectos.cronograma(id)`: the whole schedule, shared by Cronograma and
 * Reporte (Reporte reuses the cache within the 30 s). `?week=` and `?asOf=`
 * are render-only and never part of the key. Null when the viewer can't see
 * the project or it has no schedule.
 */
export function proyectoCronogramaOptions(id: string) {
  return queryOptions<ScheduleViewData | null>({
    queryKey: qk.proyectos.cronograma(id),
    queryFn: () => getProyectoCronogramaData({ id }),
    staleTime: STALE.screen,
  });
}

// ── Archivos and Clientes (5d, #962) ─────────────────────────────────────────

/**
 * `qk.proyectos.archivos(id, folder)`: one Drive folder (the root when
 * `folder` is null), 3 min stale. `?folder=` changes the key on the client;
 * the root listing also seeds the shell's Archivos count.
 */
export function proyectoArchivosOptions(id: string, folder: string | null) {
  return queryOptions<ProyectoArchivosData>({
    queryKey: qk.proyectos.archivos(id, folder ?? null),
    queryFn: async ({ client }) => {
      const data = await getProyectoArchivosData({ id, folderId: folder ?? null });
      if (!folder) seedArchivosCount(client, id, data);
      return data;
    },
    staleTime: ARCHIVOS_STALE_MS,
  });
}

/** `qk.proyectos.tab(id, 'clientes')`, 30 s stale. Null when the viewer can't see the project. */
export function proyectoClientesOptions(id: string) {
  return queryOptions<ProyectoClientesData | null>({
    queryKey: qk.proyectos.tab(id, "clientes"),
    queryFn: () => getProyectoClientesData({ id }),
    staleTime: STALE.screen,
  });
}

/** `qk.proyectos.clientesActivity(id)`: the last 50 client file events, 30 s stale. */
export function proyectoClientesActivityOptions(id: string) {
  return queryOptions<PortalActivityRow[] | null>({
    queryKey: qk.proyectos.clientesActivity(id),
    queryFn: () => getProyectoClientesActivity({ id }),
    staleTime: STALE.screen,
  });
}

// ── List, Resumen and Tareas (5a, #959) ──────────────────────────────────────

/** `qk.proyectos.list()`: the `/proyectos` portfolio, 30 s stale. `?q=` filters on the client, never in the key. */
export function proyectosPageOptions() {
  return queryOptions<ProyectosPageData>({
    queryKey: qk.proyectos.list(),
    queryFn: () => getProyectosPageData({}),
    staleTime: STALE.screen,
  });
}

/**
 * Writes the Resumen's root Drive listing count into the cached shell
 * (`counts.archivos`), as the Archivos root listing does: the shell itself
 * never lists Drive. The Resumen query function and the server prefetch
 * (before dehydrating) both call it.
 */
export function seedResumenArchivosCount(client: QueryClient, id: string, data: ProjectSummaryInput | null | undefined): void {
  const archivos = data?.files?.length;
  if (archivos === undefined) return;
  client.setQueryData<ProjectTabShell | null>(qk.proyectos.shell(id), (shell) =>
    shell ? { ...shell, counts: { ...shell.counts, archivos } } : shell,
  );
}

/** `qk.proyectos.resumen(id)`, 30 s stale. Null when the viewer can't see the project. */
export function proyectoResumenOptions(id: string) {
  return queryOptions<ProjectSummaryInput | null>({
    queryKey: qk.proyectos.resumen(id),
    queryFn: async ({ client }) => {
      const data = await getProyectoResumenData({ id });
      seedResumenArchivosCount(client, id, data);
      return data;
    },
    staleTime: STALE.screen,
  });
}

/**
 * `qk.proyectos.tab(id, 'tareas')`, 30 s stale. The tab's `estado`,
 * `responsable` and `q` filters run on the client over these rows, so they
 * are not part of the key. Null when the viewer can't see the project.
 */
export function proyectoTareasOptions(id: string) {
  return queryOptions<ProyectoTareasData | null>({
    queryKey: qk.proyectos.tab(id, "tareas"),
    queryFn: () => getProyectoTareasData({ id }),
    staleTime: STALE.screen,
  });
}

// ── Resumen Analítico quick-add hint (#997) ──────────────────────────────────

/**
 * `qk.proyectos.assigneeSuggestion(id, phaseId, staffId)`: read on demand
 * when the quick-add's responsable is at 90 % load or more; 30 s stale.
 */
export function proyectoAssigneeSuggestionOptions(id: string, phaseId: string, staffId: string) {
  return queryOptions<AssigneeSuggestion>({
    queryKey: qk.proyectos.assigneeSuggestion(id, phaseId, staffId),
    queryFn: () => getProyectoAssigneeSuggestion({ id, phaseId, staffId }),
    staleTime: STALE.screen,
  });
}
