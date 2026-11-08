"use client";

import type { JSX, ReactNode } from "react";
import { createStore, type StoreApi } from "zustand";

import type { GeneralSettings } from "@/lib/settings/general-settings";

import { definePageStore } from "./page-store";

/**
 * Ajustes › General form draft (page-scoped, Phase 9c; replaces
 * `GeneralSettingsEditorContext`): the settings being edited, shared with the
 * page's registry sections (`lib/shell/settings-sections/general/*`) so every
 * field saves with the page's one "Guardar cambios", plus the inline errors.
 * The saved settings are `qk.org.general()`.
 */

export type LogoScope = "company" | "appearance";

export type GeneralFormState = {
  /** The settings being edited. */
  settings: GeneralSettings;
  /** Error of the whole form (the save or the restore failed). */
  error: string | null;
  /** Error of one logo input. */
  logoError: { scope: LogoScope; message: string } | null;
  /** The draft came from a value saved in this browser before the settings moved to the server. */
  pickedUpLegacy: boolean;
  setCompanyField<K extends keyof GeneralSettings["company"]>(key: K, value: GeneralSettings["company"][K]): void;
  setRegionalField<K extends keyof GeneralSettings["regional"]>(key: K, value: GeneralSettings["regional"][K]): void;
  setAppearanceField<K extends keyof GeneralSettings["appearance"]>(
    key: K,
    value: GeneralSettings["appearance"][K],
  ): void;
  setSystemField<K extends keyof GeneralSettings["system"]>(key: K, value: GeneralSettings["system"][K]): void;
  /** Takes a value saved in this browser as the draft. */
  pickUpLegacy(settings: GeneralSettings): void;
  setError(message: string | null): void;
  setLogoError(error: { scope: LogoScope; message: string } | null): void;
  /** The saved (or restored) settings become the draft and the reset target. */
  replace(settings: GeneralSettings): void;
  /** Back to the last saved draft, without errors. */
  reset(): void;
};

export function createGeneralFormStore(initial: GeneralSettings): StoreApi<GeneralFormState> {
  let saved = initial;
  return createStore<GeneralFormState>()((set) => ({
    settings: initial,
    error: null,
    logoError: null,
    pickedUpLegacy: false,
    setCompanyField: (key, value) => set((s) => ({ settings: { ...s.settings, company: { ...s.settings.company, [key]: value } } })),
    setRegionalField: (key, value) =>
      set((s) => ({ settings: { ...s.settings, regional: { ...s.settings.regional, [key]: value } } })),
    setAppearanceField: (key, value) =>
      set((s) => ({ settings: { ...s.settings, appearance: { ...s.settings.appearance, [key]: value } } })),
    setSystemField: (key, value) => set((s) => ({ settings: { ...s.settings, system: { ...s.settings.system, [key]: value } } })),
    pickUpLegacy: (settings) => set({ settings, pickedUpLegacy: true }),
    setError: (error) => set({ error }),
    setLogoError: (logoError) => set({ logoError }),
    replace: (settings) => {
      saved = settings;
      set({ settings, error: null, pickedUpLegacy: false });
    },
    reset: () => set({ settings: saved, error: null, logoError: null, pickedUpLegacy: false }),
  }));
}

const generalFormStore = definePageStore<GeneralFormState, GeneralSettings>("useGeneralForm", createGeneralFormStore);

/** One draft per mount, seeded from the saved settings; reset on unmount. */
export const GeneralFormStoreProvider: (props: { initial: GeneralSettings; children: ReactNode }) => JSX.Element =
  generalFormStore.Provider;

export function useGeneralForm<T>(selector: (s: GeneralFormState) => T): T {
  return generalFormStore.useSelector(selector);
}

export function useGeneralFormApi(): StoreApi<GeneralFormState> {
  return generalFormStore.useApi();
}
