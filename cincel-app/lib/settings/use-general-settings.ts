"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";

import { GENERAL_SETTINGS_DEFAULTS, type GeneralSettings } from "@/lib/settings/general-settings";

const GeneralSettingsContext = createContext<GeneralSettings>(GENERAL_SETTINGS_DEFAULTS);

/** Supplies the server-read general settings to the client tree (set in the root layout). */
export function GeneralSettingsProvider({ value, children }: { value: GeneralSettings; children: ReactNode }) {
  return createElement(GeneralSettingsContext.Provider, { value }, children);
}

/** The company's general settings as stored on the server; a save refreshes them via router.refresh(). */
export function useGeneralSettings(): GeneralSettings {
  return useContext(GeneralSettingsContext);
}
