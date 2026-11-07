"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { updateMyPreferencesAction } from "@/lib/actions/preferences-actions";
import { IMPLEMENTED } from "@/lib/actions/preferences-actions.flags";
import { actionErrorText } from "@/lib/errors";
import type { ColorMode, ResolvedAppearance, UserPreferences } from "@/lib/types/redesign";
import { appearanceStyleBlock } from "@/lib/ui/appearance-css";
import { TEXT_SIZES, textSizeClass } from "@/lib/ui/text-size";

/**
 * Client side of the appearance (redesign FE §4.1): updates the `<html>`
 * attributes, the `.dark` class, the `text-size-{n}` class and the
 * `<style id="appearance">` block from `updateMyPreferencesAction`'s result;
 * optimistic with rollback and an error toast. Never writes variables on
 * `documentElement.style`. Mounted by the root layout for flag-on users only.
 */
export type AppearanceProviderProps = { initial: ResolvedAppearance; children: ReactNode };

type AppearanceContextValue = {
  appearance: ResolvedAppearance;
  setPreference(patch: Partial<UserPreferences>): Promise<void>;
};

/** Debounce for text-size (slider) changes, FE §4.1. */
export const TEXT_SIZE_DEBOUNCE_MS = 300;

/** The legacy `ThemeToggle` localStorage key, migrated once into the preferences row. */
export const LEGACY_THEME_STORAGE_KEY = "cincel.theme";

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function prefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

/** `light` | `dark` for a mode; `system` follows the OS. */
export function effectiveScheme(mode: ColorMode): "light" | "dark" {
  if (mode === "system") return prefersDark() ? "dark" : "light";
  return mode;
}

function hasVars(cssVars: ResolvedAppearance["cssVars"]): boolean {
  return Object.keys(cssVars.light).length > 0 || Object.keys(cssVars.dark).length > 0;
}

/**
 * Writes an appearance onto `<html>`: `data-theme` and `.dark` together,
 * `data-mode`, `data-theme-id`, `data-style`, `data-density`, the
 * `text-size-{n}` class and, when `swapStyle`, the `<style id="appearance">`
 * content. Attributes, classes and the style element only.
 */
export function applyAppearanceToDocument(appearance: ResolvedAppearance, swapStyle: boolean): void {
  const root = document.documentElement;
  const scheme = effectiveScheme(appearance.mode);
  root.setAttribute("data-mode", appearance.mode);
  root.setAttribute("data-theme", scheme);
  root.classList.toggle("dark", scheme === "dark");
  root.setAttribute("data-theme-id", appearance.theme);
  root.setAttribute("data-style", appearance.style);
  root.setAttribute("data-density", appearance.density);
  for (const size of TEXT_SIZES) root.classList.remove(textSizeClass(size));
  root.classList.add(textSizeClass(appearance.textSize));

  if (swapStyle && hasVars(appearance.cssVars)) {
    let style = document.getElementById("appearance");
    if (!style) {
      style = document.createElement("style");
      style.id = "appearance";
      document.head.appendChild(style);
    }
    const css = appearanceStyleBlock(appearance.cssVars);
    if (style.textContent !== css) style.textContent = css;
  }
}

/** The optimistic appearance for a patch: the fields the client can apply before the server answers. */
function optimistic(current: ResolvedAppearance, patch: Partial<UserPreferences>): ResolvedAppearance {
  return {
    ...current,
    ...(patch.mode ? { mode: patch.mode } : {}),
    ...(patch.density ? { density: patch.density } : {}),
    ...(patch.textSize ? { textSize: patch.textSize } : {}),
    ...(patch.theme ? { theme: patch.theme } : {}),
    ...(patch.style ? { style: patch.style } : {}),
  };
}

function isTextSizeOnly(patch: Partial<UserPreferences>): boolean {
  const keys = Object.keys(patch);
  return keys.length === 1 && keys[0] === "textSize";
}

export function AppearanceProvider({ initial, children }: AppearanceProviderProps) {
  const [appearance, setAppearance] = useState<ResolvedAppearance>(initial);
  const [renderedInitial, setRenderedInitial] = useState<ResolvedAppearance>(initial);
  /** Last appearance the server confirmed: the rollback target. */
  const committed = useRef<ResolvedAppearance>(initial);
  /** What the page shows now (optimistic included). */
  const shown = useRef<ResolvedAppearance>(initial);
  /** Changes not sent yet (the debounced text size, or a patch queued while a call runs). */
  const pendingPatch = useRef<Partial<UserPreferences>>({});
  const waiters = useRef<Array<() => void>>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const migrated = useRef(false);

  // A new server render (router.refresh, org change on the next load) replaces the state.
  if (renderedInitial !== initial) {
    setRenderedInitial(initial);
    setAppearance(initial);
  }

  useEffect(() => {
    committed.current = initial;
    shown.current = initial;
  }, [initial]);

  const show = useCallback((next: ResolvedAppearance, swapStyle: boolean) => {
    shown.current = next;
    applyAppearanceToDocument(next, swapStyle);
    setAppearance(next);
  }, []);

  const send = useCallback(
    async (patch: Partial<UserPreferences>) => {
      try {
        const result = await updateMyPreferencesAction(patch);
        committed.current = result.appearance;
        // Keep any change queued while this call was in flight.
        show(optimistic(result.appearance, pendingPatch.current), true);
      } catch (err) {
        show(optimistic(committed.current, pendingPatch.current), true);
        toast.error(actionErrorText(err, patch.redesignEnabled === true ? "redesign" : undefined));
      }
    },
    [show],
  );

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pendingPatch.current;
    const done = waiters.current;
    pendingPatch.current = {};
    waiters.current = [];
    if (Object.keys(patch).length > 0) await send(patch);
    for (const resolve of done) resolve();
  }, [send]);

  const setPreference = useCallback(
    (patch: Partial<UserPreferences>): Promise<void> => {
      pendingPatch.current = { ...pendingPatch.current, ...patch };
      show(optimistic(shown.current, patch), false);
      return new Promise<void>((resolve) => {
        waiters.current.push(resolve);
        if (isTextSizeOnly(patch)) {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush(), TEXT_SIZE_DEBOUNCE_MS);
        } else {
          void flush();
        }
      });
    },
    [flush, show],
  );

  // System mode: follow the OS while the page is open (the head script did the first paint).
  useEffect(() => {
    if (appearance.mode !== "system" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearanceToDocument(shown.current, false);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [appearance.mode]);

  // The legacy ThemeToggle choice: read once, migrated into the preferences row, deleted (FE §4.1).
  useEffect(() => {
    if (migrated.current || !IMPLEMENTED.updateMyPreferencesAction) return;
    migrated.current = true;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
      if (stored !== null) window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    } catch {
      return;
    }
    if ((stored === "light" || stored === "dark") && committed.current.mode === "system") {
      const mode = stored;
      queueMicrotask(() => void setPreference({ mode }));
    }
  }, [setPreference]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const value = useMemo(() => ({ appearance, setPreference }), [appearance, setPreference]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used inside AppearanceProvider");
  return value;
}
