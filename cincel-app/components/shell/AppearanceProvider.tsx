"use client";

import type { ReactNode } from "react";

import { notImplemented } from "@/lib/stubs";
import type { ResolvedAppearance, UserPreferences } from "@/lib/types/redesign";

/**
 * Client side of the appearance (redesign FE §4.1): updates the `<html>`
 * attributes, the `.dark` class and the `<style id="appearance">` block from
 * `updateMyPreferencesAction`'s result; optimistic with rollback.
 *
 * Contract stub: renders its children; `useAppearance` is not implemented.
 */
export type AppearanceProviderProps = { initial: ResolvedAppearance; children: ReactNode };

export function AppearanceProvider({ children }: AppearanceProviderProps) {
  return <>{children}</>;
}

export function useAppearance(): {
  appearance: ResolvedAppearance;
  setPreference(patch: Partial<UserPreferences>): Promise<void>;
} {
  return notImplemented("useAppearance");
}
