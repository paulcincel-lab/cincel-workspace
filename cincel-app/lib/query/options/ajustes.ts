import { queryOptions, type QueryClient } from "@tanstack/react-query";

import {
  getAjustesAparienciaPageData,
  getAjustesGeneralPageData,
  getAjustesGooglePageData,
  getAjustesHorarioPageData,
  getAjustesTemaPageData,
  getAjustesIntegracionesPageData,
  getAjustesNotificacionesPageData,
  getAjustesPerfilPageData,
} from "@/lib/actions/page-data/ajustes-actions";
import type {
  AjustesAparienciaPageData,
  AjustesGeneralPageData,
  AjustesGooglePageData,
  AjustesHorarioPageData,
  AjustesTemaPageData,
  AjustesIntegracionesPageData,
  AjustesNotificacionesPageData,
  AjustesPerfilPageData,
} from "@/lib/loaders/ajustes";
import { STALE, qk } from "@/lib/query/keys";
import {
  getAjustesEstatusPageData,
  getAjustesPermisosPageData,
  getAjustesPuestosPageData,
  getAjustesTramosPageData,
} from "@/lib/actions/page-data/ajustes-actions";
import type {
  AjustesEstatusPageData,
  AjustesPermisosPageData,
  AjustesPuestosPageData,
  AjustesTramosPageData,
} from "@/lib/types/ajustes-catalogs";
import type { WorkflowDetail, WorkflowRef } from "@/lib/types/core";
import { getAjustesMondayPageData } from "@/lib/actions/page-data/ajustes-actions";
import type { AjustesMondayPageData } from "@/lib/loaders/ajustes-monday";
import { seedMondayQueries } from "@/lib/query/options/monday";

/**
 * `queryOptions` for the Ajustes pages (Query Migration Phase 9), 5 min
 * stale. Each page prefetches its key on the server with the loader and
 * hydrates it, so the client never fetches on mount.
 */

// ── Personal segments (9a) ──────────────────────────────────────────────────

export type {
  AjustesAparienciaPageData,
  AjustesGeneralPageData,
  AjustesGooglePageData,
  AjustesHorarioPageData,
  AjustesTemaPageData,
  AjustesIntegracionesPageData,
  AjustesNotificacionesPageData,
  AjustesPerfilPageData,
} from "@/lib/loaders/ajustes";

export function ajustesAparienciaOptions() {
  return queryOptions<AjustesAparienciaPageData>({
    queryKey: qk.ajustes.page("apariencia"),
    queryFn: () => getAjustesAparienciaPageData({}),
    staleTime: STALE.ajustes,
  });
}

export function ajustesNotificacionesOptions() {
  return queryOptions<AjustesNotificacionesPageData>({
    queryKey: qk.ajustes.page("notificaciones"),
    queryFn: () => getAjustesNotificacionesPageData({}),
    staleTime: STALE.ajustes,
  });
}

export function ajustesPerfilOptions() {
  return queryOptions<AjustesPerfilPageData>({
    queryKey: qk.ajustes.page("perfil"),
    queryFn: () => getAjustesPerfilPageData({}),
    staleTime: STALE.ajustes,
  });
}

/** Also invalidated by the Google Calendar sync and the calendar feed dialog (they share this card). */
export function ajustesIntegracionesOptions() {
  return queryOptions<AjustesIntegracionesPageData>({
    queryKey: qk.ajustes.page("integraciones"),
    queryFn: () => getAjustesIntegracionesPageData({}),
    staleTime: STALE.ajustes,
  });
}

// ── Organization segments (9c) ──────────────────────────────────────────────

/** General's capability flags; the settings are `orgGeneralOptions()` (`qk.org.general()`). */
export function ajustesGeneralOptions() {
  return queryOptions<AjustesGeneralPageData>({
    queryKey: qk.ajustes.page("general"),
    queryFn: () => getAjustesGeneralPageData({}),
    staleTime: STALE.ajustes,
  });
}

/** The published org appearance; the editor's draft stays local. */
export function ajustesTemaOptions() {
  return queryOptions<AjustesTemaPageData>({
    queryKey: qk.ajustes.page("tema"),
    queryFn: () => getAjustesTemaPageData({}),
    staleTime: STALE.ajustes,
  });
}

/**
 * One week of Control de horario. The week is part of the key, so moving to
 * another week is one page-data call; callers pass `placeholderData:
 * keepPreviousData` to keep the page while it loads. Invalidate every week
 * with the `qk.ajustes.page("horario")` prefix.
 */
export function ajustesHorarioOptions(weekStart: string) {
  return queryOptions<AjustesHorarioPageData>({
    queryKey: qk.ajustes.page("horario", { weekStart }),
    queryFn: () => getAjustesHorarioPageData({ weekStart }),
    staleTime: STALE.ajustes,
  });
}

/** Mappings, puestos and Estado (also `google/primeros-pasos`); 30 s for the health part. */
export function ajustesGoogleOptions() {
  return queryOptions<AjustesGooglePageData>({
    queryKey: qk.ajustes.page("google"),
    queryFn: () => getAjustesGooglePageData({}),
    staleTime: STALE.ajustesGoogleHealth,
  });
}

// ── Catalog segments (9b): estatus, puestos, tramos, permisos ───────────────

export type {
  AjustesEstatusPageData,
  AjustesPermisosPageData,
  AjustesPuestosPageData,
  AjustesTramosPageData,
} from "@/lib/types/ajustes-catalogs";

/** `catalog.workflows` rows (active tramos by `sortOrder`, then name) from a page's tramos. */
export function toWorkflowRefs(workflows: readonly WorkflowDetail[]): WorkflowRef[] {
  return workflows
    .filter((workflow) => workflow.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(({ id, key, name, sortOrder }) => ({ id, key, name, sortOrder }));
}

/**
 * Seeds the catalogs a catalog page already carries, so a later invalidation
 * stays targeted: Estatus seeds `catalog.taskStatuses`, Puestos and Tramos
 * seed `catalog.workflows`. Called by the query functions on the client and
 * by the pages after their server prefetch.
 */
export function seedAjustesCatalogs(
  client: QueryClient,
  page:
    | { seg: "estatus"; data: AjustesEstatusPageData }
    | { seg: "puestos"; data: AjustesPuestosPageData }
    | { seg: "tramos"; data: AjustesTramosPageData },
): void {
  if (page.seg === "estatus") client.setQueryData(qk.catalog.taskStatuses(), page.data.statuses);
  else client.setQueryData(qk.catalog.workflows(), toWorkflowRefs(page.data.workflows));
}

export function ajustesEstatusOptions() {
  return queryOptions<AjustesEstatusPageData>({
    queryKey: qk.ajustes.page("estatus"),
    queryFn: async ({ client }) => {
      const data = await getAjustesEstatusPageData({});
      seedAjustesCatalogs(client, { seg: "estatus", data });
      return data;
    },
    staleTime: STALE.ajustes,
  });
}

/** Optimistic reorder target: `reorderPositionsAction` patches `positions` here and rolls back on error. */
export function ajustesPuestosOptions() {
  return queryOptions<AjustesPuestosPageData>({
    queryKey: qk.ajustes.page("puestos"),
    queryFn: async ({ client }) => {
      const data = await getAjustesPuestosPageData({});
      seedAjustesCatalogs(client, { seg: "puestos", data });
      return data;
    },
    staleTime: STALE.ajustes,
  });
}

export function ajustesTramosOptions() {
  return queryOptions<AjustesTramosPageData>({
    queryKey: qk.ajustes.page("tramos"),
    queryFn: async ({ client }) => {
      const data = await getAjustesTramosPageData({});
      seedAjustesCatalogs(client, { seg: "tramos", data });
      return data;
    },
    staleTime: STALE.ajustes,
  });
}

/** `savePermissionsMatrixAction` / `restoreDefaultPermissionsAction` write it back (#971). */
export function ajustesPermisosOptions() {
  return queryOptions<AjustesPermisosPageData>({
    queryKey: qk.ajustes.page("permisos"),
    queryFn: () => getAjustesPermisosPageData({}),
    staleTime: STALE.ajustes,
  });
}

// ── Monday (9d) ─────────────────────────────────────────────────────────────

export type { AjustesMondayPageData } from "@/lib/loaders/ajustes-monday";

/**
 * Status, the latest run (read only), the choices and the history. A fetch
 * also seeds `monday.run(id)`, `monday.choices()` and `monday.history()`;
 * the page does the same after its server prefetch.
 */
export function ajustesMondayOptions() {
  return queryOptions<AjustesMondayPageData>({
    queryKey: qk.ajustes.page("monday"),
    queryFn: async ({ client }) => {
      const data = await getAjustesMondayPageData({});
      seedMondayQueries(client, data);
      return data;
    },
    staleTime: STALE.ajustes,
  });
}
