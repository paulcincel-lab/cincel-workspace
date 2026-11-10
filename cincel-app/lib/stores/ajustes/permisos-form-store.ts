"use client";

import type { JSX, ReactNode } from "react";
import { createStore, type StoreApi } from "zustand";

import type { PermissionValue } from "@/lib/auth/permissionsRegistry";
import type { PermissionsState } from "@/lib/auth/permissionsState";
import type { SystemAccessRole } from "@/lib/data/roles";

import { definePageStore } from "./page-store";

/**
 * Ajustes › Permisos editor (page-scoped, #971): the matrix draft and the
 * save error. The saved matrix is `qk.ajustes.page('permisos')`; nothing is
 * kept in the browser, so leaving the page drops the draft.
 */

export type PermisosFormInitial = { saved: PermissionsState };

export type PermisosFormState = {
  draft: PermissionsState;
  error: string | null;
  /** Sets one cell of the draft and clears the error. */
  setCell(role: SystemAccessRole, moduleId: string, key: string, value: PermissionValue): void;
  setError(message: string | null): void;
  /** The saved matrix becomes the draft and the discard target. */
  replace(saved: PermissionsState): void;
  /** Back to the last saved matrix, without an error. */
  reset(): void;
};

export function createPermisosFormStore(initial: PermisosFormInitial): StoreApi<PermisosFormState> {
  let saved = initial.saved;
  return createStore<PermisosFormState>()((set) => ({
    draft: initial.saved,
    error: null,
    setCell: (role, moduleId, key, value) =>
      set((s) => {
        const roleState = s.draft[role] ?? {};
        const moduleState = roleState[moduleId] ?? {};
        if (moduleState[key] === value) return s;
        return {
          error: null,
          draft: { ...s.draft, [role]: { ...roleState, [moduleId]: { ...moduleState, [key]: value } } },
        };
      }),
    setError: (error) => set({ error }),
    replace: (next) => {
      saved = next;
      set({ draft: next, error: null });
    },
    reset: () => set({ draft: saved, error: null }),
  }));
}

const permisosFormStore = definePageStore<PermisosFormState, PermisosFormInitial>("usePermisosForm", createPermisosFormStore);

/** One draft per mount, seeded from the saved matrix; reset on unmount. */
export const PermisosFormStoreProvider: (props: { initial: PermisosFormInitial; children: ReactNode }) => JSX.Element =
  permisosFormStore.Provider;

export function usePermisosForm<T>(selector: (s: PermisosFormState) => T): T {
  return permisosFormStore.useSelector(selector);
}

export function usePermisosFormApi(): StoreApi<PermisosFormState> {
  return permisosFormStore.useApi();
}
