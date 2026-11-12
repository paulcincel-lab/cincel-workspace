"use client";

import { create, type StoreApi, type UseBoundStore } from "zustand";

import { registerUiStoreReset } from "@/lib/query/reset-client-state";

/**
 * Calendario UI state (FE §10, zustand.md). View and range are URL state
 * (`vista`, `fecha`), never store state. The store never copies server data.
 * Nothing is persisted; it is cleared on an identity change.
 */
export type CalendarioTile = "reuniones" | "vence" | "riesgo" | "bloqueas";
export type CalendarioProposalState = { id: string; checked: string[] };
export type CalendarioDragState = { itemId: string; overDate: string | null };

export type CalendarioUiState = {
  /** Focus ring / keyboard selection; the detail itself is `?evento=`. */
  selectedItemId: string | null;
  setSelectedItemId(id: string | null): void;
  /** Mes/Semana keyboard cursor; passed to the asistente context. */
  selectedDate: string | null;
  setSelectedDate(date: string | null): void;
  proposal: CalendarioProposalState | null;
  setProposal(p: CalendarioProposalState | null): void;
  toggleChange(changeId: string): void;
  resumenCollapsed: boolean;
  setResumenCollapsed(v: boolean): void;
  expandedTile: CalendarioTile | null;
  setExpandedTile(t: CalendarioTile | null): void;
  barDraft: string;
  setBarDraft(t: string): void;
  planDrops: string[];
  addPlanDrop(id: string): void;
  clearPlanDrops(): void;
  dragging: CalendarioDragState | null;
  setDragging(d: CalendarioDragState | null): void;
  /** "Ahora no" on the connect banner; lasts the session (FE §6.3). */
  googleBannerDismissed: boolean;
  dismissGoogleBanner(): void;
  /** Optional "Horas" column of the Analítico table (FE §4.3); the viewer's choice is kept in the browser. */
  showHours: boolean;
  setShowHours(v: boolean): void;
  reset(): void;
};

type CalendarioUiData = Pick<
  CalendarioUiState,
  | "selectedItemId"
  | "selectedDate"
  | "proposal"
  | "resumenCollapsed"
  | "expandedTile"
  | "barDraft"
  | "planDrops"
  | "dragging"
  | "googleBannerDismissed"
  | "showHours"
>;

export const CALENDARIO_UI_INITIAL: CalendarioUiData = {
  selectedItemId: null,
  selectedDate: null,
  proposal: null,
  resumenCollapsed: false,
  expandedTile: null,
  barDraft: "",
  planDrops: [],
  dragging: null,
  googleBannerDismissed: false,
  showHours: false,
};

export const useCalendarioUi: UseBoundStore<StoreApi<CalendarioUiState>> = create<CalendarioUiState>((set) => ({
  ...CALENDARIO_UI_INITIAL,
  setSelectedItemId: (id) => set({ selectedItemId: id }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setProposal: (proposal) => set({ proposal }),
  toggleChange: (changeId) =>
    set((s) =>
      s.proposal
        ? {
            proposal: {
              ...s.proposal,
              checked: s.proposal.checked.includes(changeId)
                ? s.proposal.checked.filter((id) => id !== changeId)
                : [...s.proposal.checked, changeId],
            },
          }
        : s,
    ),
  setResumenCollapsed: (resumenCollapsed) => set({ resumenCollapsed }),
  setExpandedTile: (expandedTile) => set({ expandedTile }),
  setBarDraft: (barDraft) => set({ barDraft }),
  addPlanDrop: (id) => set((s) => (s.planDrops.includes(id) ? s : { planDrops: [...s.planDrops, id] })),
  clearPlanDrops: () => set({ planDrops: [] }),
  setDragging: (dragging) => set({ dragging }),
  dismissGoogleBanner: () => set({ googleBannerDismissed: true }),
  setShowHours: (showHours) => set({ showHours }),
  reset: () => set(CALENDARIO_UI_INITIAL),
}));

/** Back to the initial state (identity change, tests). */
export function resetCalendarioUi(): void {
  useCalendarioUi.setState(CALENDARIO_UI_INITIAL);
}

registerUiStoreReset(resetCalendarioUi);
