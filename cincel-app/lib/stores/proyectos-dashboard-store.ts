"use client";

import { createDashboardStore } from "@/lib/stores/dashboard-store";

/**
 * Dashboard UI state of /proyectos (zustand.md §2.5, decision D1): the
 * selected tramo (`selectedKpi`, session only) and the collapsed widgets.
 * Pure UI state: nothing here reaches a query key or the server. The Estilo
 * picks the whole layout (ADR 0004), so there are no per-widget chart/table
 * views any more; the range and series fields of the factory stay unused.
 *
 * Persisted (`cincel.ui.dashboard.proyectos.v2`): `collapsed` (and the unused
 * `range` / `views` / `hiddenSeries`). The key moved from `v1` so the views
 * stored before the Estilos layouts are dropped. The tramo selection is never
 * persisted. The factory registers the store with the logout / test reset
 * and with the post-mount hydrator.
 */
export type ProyectosWidget = "tramoStrip" | "portfolio";
/** Tramo key (`WorkflowRef.key`), incl. `NO_TRAMO_KEY` ("sin-tramo"). */
export type ProyectosKpiKey = string;

export const PROYECTOS_WIDGETS: readonly ProyectosWidget[] = ["tramoStrip", "portfolio"];

/** Version of the storage key (`cincel.ui.dashboard.proyectos.v2`). */
export const PROYECTOS_STORAGE_KEY_VERSION = 2;

export const useProyectosDashboard = createDashboardStore<ProyectosWidget, ProyectosKpiKey>("proyectos", {
  widgets: PROYECTOS_WIDGETS,
  storageKeyVersion: PROYECTOS_STORAGE_KEY_VERSION,
});

/** The store's state before any action (defaults; no persisted value applied). */
export const PROYECTOS_DASHBOARD_INITIAL = useProyectosDashboard.getInitialState();

/** Back to the defaults (tests; logout goes through the factory's registered reset). */
export function resetProyectosDashboard(): void {
  useProyectosDashboard.getState().reset();
}

/** Selected tramo key, or null. */
export const selectSelectedTramo = (s: { selectedKpi: ProyectosKpiKey | null }): ProyectosKpiKey | null => s.selectedKpi;

/** True when the "Proyectos por tramo" strip is collapsed. */
export const selectTramoStripCollapsed = (s: { collapsed: Partial<Record<ProyectosWidget, boolean>> }): boolean =>
  s.collapsed.tramoStrip ?? false;
