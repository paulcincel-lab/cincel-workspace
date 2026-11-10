"use client";

import { useMemo } from "react";

import { useStyle } from "@/components/shell/StyleProvider";
import { createDashboardStore, useWidgetView, type WidgetView } from "@/lib/stores/dashboard-store";
import type { PresentationStyle } from "@/lib/types/redesign";

/**
 * `useInicioDashboard` (zustand.md §2.5): the Inicio dashboard's UI choices.
 * Pure UI state over the `qk.inicio()` data; nothing here causes a server
 * call. Persisted under `cincel.ui.dashboard.inicio.v1` (`range`,
 * `collapsed`, `views`, `hiddenSeries`); `selectedKpi` lives for the session
 * only. The active style is never stored: `views` keeps the user's overrides
 * per style and each widget keeps its own per-style fallback.
 */
export type InicioWidget =
  | "kpis"
  | "tramoDonut"
  | "weeklyPace"
  | "attention"
  | "myDay"
  | "projectsProgress"
  | "workload"
  | "hero"
  | "todayAgenda";
export type InicioKpiKey =
  | "proyectos_activos"
  | "vencidas"
  | "bloqueadas"
  | "revisiones_7d"
  | "completadas_semana"
  | "abiertas"
  | "horas_semana";

/** Every Inicio widget id; stored keys of other ids are dropped on rehydrate. */
export const INICIO_WIDGETS: readonly InicioWidget[] = [
  "kpis",
  "tramoDonut",
  "weeklyPace",
  "attention",
  "myDay",
  "projectsProgress",
  "workload",
  "hero",
  "todayAgenda",
];

/** Series of "Ritmo semanal" (`WeeklyPaceChart`). */
export type WeeklyPaceSeries = "completed" | "created";
export const WEEKLY_PACE_SERIES: readonly WeeklyPaceSeries[] = ["completed", "created"];

export const useInicioDashboard = createDashboardStore<InicioWidget, InicioKpiKey>("inicio", {
  range: "8w",
  widgets: INICIO_WIDGETS,
  // The last visible series of "Ritmo semanal" cannot be hidden.
  series: { weeklyPace: WEEKLY_PACE_SERIES },
});

/** The KPI keys of `lib/dashboard/inicio.ts` (`INICIO_KPI`). */
export const INICIO_KPI_KEYS: readonly InicioKpiKey[] = [
  "proyectos_activos",
  "vencidas",
  "bloqueadas",
  "revisiones_7d",
  "completadas_semana",
  "abiertas",
  "horas_semana",
];

const KPI_KEY_SET: ReadonlySet<string> = new Set(INICIO_KPI_KEYS);

export function isInicioKpiKey(key: string): key is InicioKpiKey {
  return KPI_KEY_SET.has(key);
}

/** Per-style views matching what each widget renders by default. */
export const TRAMO_VIEW = { visual: "chart", esencial: "chart", analitico: "table" } as const satisfies Record<
  PresentationStyle,
  WidgetView
>;
export const PACE_VIEW = { visual: "chart", esencial: "chart", analitico: "table" } as const satisfies Record<
  PresentationStyle,
  WidgetView
>;
export const WORKLOAD_VIEW = { visual: "chart", esencial: "chart", analitico: "table" } as const satisfies Record<
  PresentationStyle,
  WidgetView
>;

/** `WidgetCard`'s `collapsible` prop for one Inicio widget. */
export function useInicioCollapsible(widget: InicioWidget): { collapsed: boolean; onToggle(): void } {
  const collapsed = useInicioDashboard((s) => s.collapsed[widget] ?? false);
  const toggleCollapsed = useInicioDashboard((s) => s.toggleCollapsed);
  return useMemo(() => ({ collapsed, onToggle: () => toggleCollapsed(widget) }), [collapsed, toggleCollapsed, widget]);
}

/**
 * The chart / table choice of one widget in the current style.
 *
 * - `view`: what the toggle shows as picked (`useWidgetView`).
 * - `override`: what to pass to the widget's `view` prop. Undefined while the
 *   pick equals the style's fallback, so the widget's own style rendering
 *   (`StyleView`) stays exactly as without the store.
 * - `setView` stores the pick for the current style only.
 */
export function useInicioWidgetView(
  widget: InicioWidget,
  fallback: Record<PresentationStyle, WidgetView>,
): { view: WidgetView; override: WidgetView | undefined; setView(view: WidgetView): void } {
  const { style } = useStyle();
  const view = useWidgetView(useInicioDashboard, widget, fallback);
  const setWidgetView = useInicioDashboard((s) => s.setWidgetView);
  return useMemo(
    () => ({
      view,
      override: view === fallback[style] ? undefined : view,
      setView: (next: WidgetView) => setWidgetView(style, widget, next),
    }),
    [view, fallback, style, setWidgetView, widget],
  );
}
