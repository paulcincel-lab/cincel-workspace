"use client";

import { createContext, useContext } from "react";

import type { OrgAppearance, UserPreferences } from "@/lib/types/redesign";

/** Debounce of the "Tamaño de texto" slider before it calls the action (R6-03). */
export const TEXT_SIZE_DEBOUNCE_MS = 400;

/** Copy shown on the Tema and Estilo cards when the organization fixed them (FE §3.8, §9). */
export const OVERRIDE_LOCKED_COPY = "La organización fijó el tema y el estilo.";

/** Which Apariencia section an inline error belongs to. */
export type AparienciaSectionKey = "tema" | "estilo" | "modo" | "densidad" | "tamano-texto";

export type AparienciaContextValue = {
  /** The caller's preferences, optimistically updated. */
  preferences: UserPreferences;
  org: OrgAppearance;
  isAdmin: boolean;
  /** False when the org disallows overrides, or the action answered `OVERRIDE_DISABLED`. */
  overridesAllowed: boolean;
  /** Live text size (moves with the slider before the debounced save). */
  textSize: number;
  /** Inline error per section (Spanish copy), null when none. */
  errors: Partial<Record<AparienciaSectionKey, string>>;
  /** Optimistic change; rolls back the local state on failure. */
  change(section: AparienciaSectionKey, patch: Partial<UserPreferences>): Promise<void>;
  /** Slider input: updates `textSize` at once and saves after `TEXT_SIZE_DEBOUNCE_MS`. */
  changeTextSize(value: number): void;
};

export const AparienciaContext = createContext<AparienciaContextValue | null>(null);

export function useApariencia(): AparienciaContextValue {
  const value = useContext(AparienciaContext);
  if (!value) throw new Error("useApariencia must be used inside AparienciaClient");
  return value;
}
