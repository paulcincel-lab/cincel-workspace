"use client";

import { createDashboardStore } from "@/lib/stores/dashboard-store";
import type { Availability } from "@/lib/types/widgets";

/**
 * `usePersonasDashboard` (zustand.md §2.5): UI state of the Personas · Equipo
 * dashboard. Pure UI state, never server data and never the current style.
 *
 * - `selectedKpi`: the availability picked in the "Disponibilidad esta
 *   semana" legend; filters the team to the people with that availability on
 *   at least one day. Session only (survives navigation, not a reload).
 * - `collapsed.availability`: "Disponibilidad esta semana" collapsed.
 * - `views`, `range` and `hiddenSeries` are unused here: the Estilo is the
 *   only layout choice (ADR 0004) and the page has no weekly series.
 *
 * Persisted under `cincel.ui.dashboard.personas.v1` (only widget ids and the
 * unused views/range/series), rehydrated after mount.
 */
export type PersonasWidget = "availability" | "team";
export type PersonasKpiKey = Availability;

export const usePersonasDashboard = createDashboardStore<PersonasWidget, PersonasKpiKey>("personas");
