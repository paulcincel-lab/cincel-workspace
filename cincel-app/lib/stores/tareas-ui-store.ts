"use client";

import { create, type StoreApi, type UseBoundStore } from "zustand";

import { registerUiStoreReset } from "@/lib/query/reset-client-state";

/**
 * Tareas UI state shared across the views (zustand.md §2.4): only the day
 * selected in the Calendario view, so it survives switching to Lista or
 * Tablero and back. The calendar cursor lives on the URL (`?fecha=`); the
 * event popover, the feed dialog and the "now" tick stay local.
 *
 * `selectedDay` null means "the `?fecha` day, or today". Nothing is persisted.
 *
 * `analitico.collapsed`: the Analítico project and tramo groups the viewer
 * collapsed (every group starts expanded); kept while the session lasts and
 * cleared on an identity change, so it is remembered per user.
 */
export type TareasUiState = {
  calendar: { selectedDay: string | null /* YYYY-MM-DD */ };
  analitico: { collapsed: string[] };
  selectCalendarDay(day: string | null): void;
  setAnaliticoCollapsed(ids: string[]): void;
  reset(): void;
};

export const TAREAS_UI_INITIAL: Pick<TareasUiState, "calendar" | "analitico"> = {
  calendar: { selectedDay: null },
  analitico: { collapsed: [] },
};

export const useTareasUi: UseBoundStore<StoreApi<TareasUiState>> = create<TareasUiState>((set) => ({
  ...TAREAS_UI_INITIAL,
  selectCalendarDay: (day) => set({ calendar: { selectedDay: day } }),
  setAnaliticoCollapsed: (ids) => set({ analitico: { collapsed: ids } }),
  reset: () => set(TAREAS_UI_INITIAL),
}));

/** Back to the initial state (identity change, tests). */
export function resetTareasUi(): void {
  useTareasUi.setState(TAREAS_UI_INITIAL);
}

export const selectSelectedDay = (s: TareasUiState) => s.calendar.selectedDay;

export const selectAnaliticoCollapsed = (s: TareasUiState) => s.analitico.collapsed;

/**
 * Clears the selected day when it lies outside `range` (inclusive
 * `YYYY-MM-DD`), as when `?fecha` moves the calendar to another month.
 * Returns true when it cleared it.
 */
export function clearSelectedDayOutside(range: { from: string; to: string }): boolean {
  const day = selectSelectedDay(useTareasUi.getState());
  if (day === null || (day >= range.from && day <= range.to)) return false;
  useTareasUi.getState().selectCalendarDay(null);
  return true;
}

registerUiStoreReset(resetTareasUi);
