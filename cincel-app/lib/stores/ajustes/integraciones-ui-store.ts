"use client";

import { createElement, type JSX, type ReactNode } from "react";
import { createStore, type StoreApi } from "zustand";

import { definePageStore } from "./page-store";

/**
 * Ajustes › Integraciones UI state (page-scoped, Phase 9a): the Gmail
 * disconnect dialog and the inline errors of the Gmail card. The statuses
 * themselves are `qk.ajustes.page('integraciones')`; pending flags come from
 * the mutations.
 */

export type IntegracionesUiState = {
  disconnectOpen: boolean;
  syncError: string | null;
  disconnectError: string | null;
  setDisconnectOpen(open: boolean): void;
  setSyncError(message: string | null): void;
  setDisconnectError(message: string | null): void;
  reset(): void;
};

const INITIAL = { disconnectOpen: false, syncError: null, disconnectError: null } as const;

export function createIntegracionesUiStore(): StoreApi<IntegracionesUiState> {
  return createStore<IntegracionesUiState>()((set) => ({
    ...INITIAL,
    setDisconnectOpen: (disconnectOpen) => set({ disconnectOpen }),
    setSyncError: (syncError) => set({ syncError }),
    setDisconnectError: (disconnectError) => set({ disconnectError }),
    reset: () => set({ ...INITIAL }),
  }));
}

const integracionesUiStore = definePageStore<IntegracionesUiState, null>("useIntegracionesUi", () =>
  createIntegracionesUiStore(),
);

/** One UI store per mount (`useRef`); reset on unmount. */
export function IntegracionesUiStoreProvider({ children }: { children: ReactNode }): JSX.Element {
  return createElement(integracionesUiStore.Provider, { initial: null }, children);
}

export function useIntegracionesUi<T>(selector: (s: IntegracionesUiState) => T): T {
  return integracionesUiStore.useSelector(selector);
}
