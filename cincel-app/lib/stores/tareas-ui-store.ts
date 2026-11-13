"use client";

import { create, type StoreApi, type UseBoundStore } from "zustand";

import { registerUiStoreReset } from "@/lib/query/reset-client-state";

/**
 * Tareas UI state shared across the views (zustand.md §2.4). Nothing is
 * persisted.
 *
 * `analitico.collapsed`: the Analítico project and etapa groups the viewer
 * collapsed (every group starts expanded); kept while the session lasts and
 * cleared on an identity change, so it is remembered per user.
 */
export type TareasUiState = {
  analitico: { collapsed: string[] };
  setAnaliticoCollapsed(ids: string[]): void;
  reset(): void;
};

export const TAREAS_UI_INITIAL: Pick<TareasUiState, "analitico"> = {
  analitico: { collapsed: [] },
};

export const useTareasUi: UseBoundStore<StoreApi<TareasUiState>> = create<TareasUiState>((set) => ({
  ...TAREAS_UI_INITIAL,
  setAnaliticoCollapsed: (ids) => set({ analitico: { collapsed: ids } }),
  reset: () => set(TAREAS_UI_INITIAL),
}));

/** Back to the initial state (identity change, tests). */
export function resetTareasUi(): void {
  useTareasUi.setState(TAREAS_UI_INITIAL);
}

export const selectAnaliticoCollapsed = (s: TareasUiState) => s.analitico.collapsed;

registerUiStoreReset(resetTareasUi);
