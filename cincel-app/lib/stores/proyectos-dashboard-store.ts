"use client";

import { useCallback } from "react";

import { useStyle } from "@/components/shell/StyleProvider";
import { createDashboardStore, useWidgetView, type WidgetView } from "@/lib/stores/dashboard-store";
import type { PresentationStyle } from "@/lib/types/redesign";

/**
 * Dashboard UI state of /proyectos (zustand.md §2.5, decision D1): the
 * selected tramo of "Proyectos por tramo" (`selectedKpi`, session only), the
 * collapsed strip and the per-style chart/table overrides of the strip and
 * the portfolio. Pure UI state: nothing here reaches a query key or the
 * server. The range and series fields of the factory stay unused (the page
 * has no weekly series).
 *
 * Persisted (`cincel.ui.dashboard.proyectos.v1`): `collapsed`, `views` (and
 * the unused `range` / `hiddenSeries`). The tramo selection is never
 * persisted. The factory registers the store with the logout / test reset
 * and with the post-mount hydrator.
 */
export type ProyectosWidget = "tramoStrip" | "portfolio";
/** Tramo segment key from `buildTramoSegments`, incl. `NO_TRAMO_KEY` ("sin-tramo"). */
export type ProyectosKpiKey = string;

export const PROYECTOS_WIDGETS: readonly ProyectosWidget[] = ["tramoStrip", "portfolio"];

export const useProyectosDashboard = createDashboardStore<ProyectosWidget, ProyectosKpiKey>("proyectos", {
  widgets: PROYECTOS_WIDGETS,
});

/**
 * What each widget shows in each style when the user picked nothing; equals
 * the render before the dashboard store existed. Strip: the strip in Visual,
 * the `DistributionWidget` list in Esencial ("chart") and its table in
 * Analítico. Portfolio: cards in Visual and Esencial, the table in Analítico.
 */
export const PROYECTOS_VIEW_FALLBACK: Record<ProyectosWidget, Record<PresentationStyle, WidgetView>> = {
  tramoStrip: { visual: "chart", esencial: "chart", analitico: "table" },
  portfolio: { visual: "chart", esencial: "chart", analitico: "table" },
};

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

export type ProyectosWidgetView = {
  /** What the widget shows in the current style: the user's pick, else the style's default. */
  view: WidgetView;
  /** The pick when it differs from the style's default (hand it to the widget's `view`), else undefined. */
  override: WidgetView | undefined;
  /** Stores the pick for the current style only. */
  setView(view: WidgetView): void;
};

/**
 * The chart/table view of one /proyectos widget for the current style
 * (`useStyle()`, never stored). Without a pick `override` is undefined, so
 * the widget renders exactly its per-style default.
 */
export function useProyectosWidgetView(widget: ProyectosWidget): ProyectosWidgetView {
  const { style } = useStyle();
  const view = useWidgetView(useProyectosDashboard, widget, PROYECTOS_VIEW_FALLBACK[widget]);
  const setWidgetView = useProyectosDashboard((s) => s.setWidgetView);
  const setView = useCallback((next: WidgetView) => setWidgetView(style, widget, next), [setWidgetView, style, widget]);
  return { view, override: view === PROYECTOS_VIEW_FALLBACK[widget][style] ? undefined : view, setView };
}
