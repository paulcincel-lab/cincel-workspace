"use client";

import { createDashboardStore, type WidgetView } from "@/lib/stores/dashboard-store";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { Availability } from "@/lib/types/widgets";

/**
 * `usePersonasDashboard` (zustand.md §2.5): UI state of the Personas · Equipo
 * dashboard. Pure UI state, never server data and never the current style.
 *
 * - `selectedKpi`: the availability picked in the "Disponibilidad esta
 *   semana" legend; filters the team to the people with that availability on
 *   at least one day. Session only (survives navigation, not a reload).
 * - `collapsed.availability`: "Disponibilidad esta semana" collapsed.
 * - `views[style].availability | team`: grid/cards vs table, per style.
 * - `range` and `hiddenSeries` are unused here: the page has no weekly series.
 *
 * Persisted under `cincel.ui.dashboard.personas.v1` (only widget ids, view
 * names and the unused range/series), rehydrated after mount.
 */
export type PersonasWidget = "availability" | "team";
export type PersonasKpiKey = Availability;

export const usePersonasDashboard = createDashboardStore<PersonasWidget, PersonasKpiKey>("personas");

/**
 * Per-style fallbacks, equal to the render without overrides: Visual rows /
 * cards and the Esencial list are the "chart" views; Analítico shows tables.
 */
export const PERSONAS_VIEW_FALLBACK: Record<PresentationStyle, WidgetView> = {
  visual: "chart",
  esencial: "chart",
  analitico: "table",
};
