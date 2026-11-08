"use client";

import type { JSX, ReactNode } from "react";
import { createStore, type StoreApi } from "zustand";

import type { PerfilData } from "@/lib/types/redesign";

import { definePageStore } from "./page-store";

/**
 * Ajustes › Perfil form draft (page-scoped, Phase 9a): the editable nombre,
 * teléfono and firma, their inline errors and the form error. The saved
 * profile is `qk.ajustes.page('perfil')`; the photo is `qk.me.profile()`.
 */

export type PerfilDraft = Pick<PerfilData, "name" | "phone" | "emailSignature">;

export type PerfilFormState = {
  draft: PerfilDraft;
  /** The last saved values: what "Cancelar" goes back to and what "dirty" compares with. */
  saved: PerfilDraft;
  errors: Partial<Record<keyof PerfilDraft, string>>;
  /** Error of the whole save. */
  formError: string | null;
  setField<K extends keyof PerfilDraft>(key: K, value: PerfilDraft[K]): void;
  setFieldError(key: keyof PerfilDraft, message: string | null): void;
  setFormError(message: string | null): void;
  /** A save succeeded: the saved values become the draft and the reset target. */
  commit(saved: PerfilDraft): void;
  /** Back to the saved values, without errors. */
  reset(): void;
};

export function perfilDraftOf(profile: Pick<PerfilData, "name" | "phone" | "emailSignature">): PerfilDraft {
  return { name: profile.name, phone: profile.phone, emailSignature: profile.emailSignature };
}

export function createPerfilFormStore(initial: PerfilDraft): StoreApi<PerfilFormState> {
  return createStore<PerfilFormState>()((set) => ({
    draft: initial,
    saved: initial,
    errors: {},
    formError: null,
    setField: (key, value) =>
      set((s) => {
        const errors = { ...s.errors };
        delete errors[key];
        return { draft: { ...s.draft, [key]: value }, errors };
      }),
    setFieldError: (key, message) =>
      set((s) => {
        const errors = { ...s.errors };
        if (message === null) delete errors[key];
        else errors[key] = message;
        return { errors };
      }),
    setFormError: (formError) => set({ formError }),
    commit: (saved) => set({ draft: saved, saved, errors: {}, formError: null }),
    reset: () => set((s) => ({ draft: s.saved, errors: {}, formError: null })),
  }));
}

const perfilFormStore = definePageStore<PerfilFormState, PerfilDraft>("usePerfilForm", createPerfilFormStore);

/** One draft per mount (`useRef`), seeded from the saved profile; reset on unmount. */
export const PerfilFormStoreProvider: (props: { initial: PerfilDraft; children: ReactNode }) => JSX.Element =
  perfilFormStore.Provider;

export function usePerfilForm<T>(selector: (s: PerfilFormState) => T): T {
  return perfilFormStore.useSelector(selector);
}

export function usePerfilFormApi(): StoreApi<PerfilFormState> {
  return perfilFormStore.useApi();
}
