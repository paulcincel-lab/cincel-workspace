"use client";

import type { JSX, ReactNode } from "react";
import { createStore, type StoreApi } from "zustand";

import type { TimeTrackingSettings } from "@/lib/types/redesign";

import { definePageStore } from "./page-store";

/**
 * Ajustes › Control de horario form (page-scoped, Phase 9c; replaces
 * `HorarioContext`): the settings draft, the inline errors and the week the
 * report shows. The saved settings and the report rows are
 * `qk.ajustes.page('horario', { weekStart })`; `weekStart` is that key's input.
 */

/** The settings as edited (same shape as the saved ones). */
export type TimeTrackingSettingsDraft = TimeTrackingSettings;

/** `YYYY-MM-DD`. */
export type IsoDate = string;

export type HorarioFormInitial = {
  draft: TimeTrackingSettingsDraft;
  /** The Monday the report opens on. */
  weekStart: IsoDate;
  /** Local date (America/Mexico_City) of the viewer's today. */
  today: IsoDate;
  /** The viewer's first name, for the prompt preview ("Buenos días, {name}"). */
  viewerName: string;
};

export type HorarioFormState = {
  draft: TimeTrackingSettingsDraft;
  /** Inline errors; `form` is the error of the save. */
  errors: Partial<Record<string, string>>;
  weekStart: IsoDate;
  /** Page constants (not server data): fixed for the mount. */
  today: IsoDate;
  viewerName: string;
  /** Merges a patch into the draft and clears the form error. */
  setField(patch: Partial<TimeTrackingSettingsDraft>): void;
  setWeekStart(weekStart: IsoDate): void;
  setError(key: string, message: string | null): void;
  /** The saved settings become the new draft and the reset target. */
  replace(saved: TimeTrackingSettingsDraft): void;
  /** Back to the last saved draft and the first week, without errors. */
  reset(): void;
};

export function createHorarioFormStore(initial: HorarioFormInitial): StoreApi<HorarioFormState> {
  let saved = initial.draft;
  return createStore<HorarioFormState>()((set) => ({
    draft: initial.draft,
    errors: {},
    weekStart: initial.weekStart,
    today: initial.today,
    viewerName: initial.viewerName,
    setField: (patch) =>
      set((s) => {
        const errors = { ...s.errors };
        delete errors.form;
        return { draft: { ...s.draft, ...patch }, errors };
      }),
    setWeekStart: (weekStart) => set({ weekStart }),
    setError: (key, message) =>
      set((s) => {
        const errors = { ...s.errors };
        if (message === null) delete errors[key];
        else errors[key] = message;
        return { errors };
      }),
    replace: (next) => {
      saved = next;
      set({ draft: next, errors: {} });
    },
    reset: () => set({ draft: saved, errors: {}, weekStart: initial.weekStart }),
  }));
}

const horarioFormStore = definePageStore<HorarioFormState, HorarioFormInitial>("useHorarioForm", createHorarioFormStore);

/** One form per mount, seeded from the saved settings; reset on unmount. */
export const HorarioFormStoreProvider: (props: { initial: HorarioFormInitial; children: ReactNode }) => JSX.Element =
  horarioFormStore.Provider;

export function useHorarioForm<T>(selector: (s: HorarioFormState) => T): T {
  return horarioFormStore.useSelector(selector);
}

export function useHorarioFormApi(): StoreApi<HorarioFormState> {
  return horarioFormStore.useApi();
}
