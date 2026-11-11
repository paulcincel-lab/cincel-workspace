"use client";

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { createStore, useStore, type StoreApi } from "zustand";

import { updateMyPreferencesAction } from "@/lib/actions/preferences-actions";
import { qk } from "@/lib/query/keys";
import { actionErrorCode } from "@/lib/errors";
import { mutationErrorText, runAction } from "@/lib/query/mutation";
import { getBrowserQueryClient, registerUiStoreReset } from "@/lib/query/reset-client-state";
import type { ColorMode, PresentationStyle, ResolvedAppearance, UserPreferences } from "@/lib/types/redesign";
import { appearanceStyleBlock } from "@/lib/ui/appearance-css";
import { DEFAULT_HIDE_COMPLETED_TASKS } from "@/lib/ui/preferences";
import { TEXT_SIZES, textSizeClass } from "@/lib/ui/text-size";

/**
 * `useAppearance` (zustand.md §2.6, decision D2): the client side of the
 * appearance (redesign FE §4.1). Replaces the `AppearanceProvider` context
 * with the same behaviour:
 *
 * - `setPreference` applies the patch at once (store + `<html>` attributes,
 *   `.dark`, `text-size-{n}`), persists it with `updateMyPreferencesAction`
 *   and swaps `<style id="appearance">` with the vars it returns; on error it
 *   rolls back to the last confirmed appearance and shows the error toast.
 * - A text-size-only patch is debounced `TEXT_SIZE_DEBOUNCE_MS`; one save
 *   carries every change queued meanwhile.
 * - Never writes variables on `documentElement.style`.
 * - Also holds the caller's raw `preferences` (null theme/style = follow the
 *   organization), seeded by the root layout, so Ajustes › Apariencia reads
 *   and writes the store instead of a page copy (Phase 9a). A patch sent with
 *   a `section` reports its error inline (`errors[section]`) instead of a
 *   toast, and `OVERRIDE_DISABLED` turns `overridesAllowed` off.
 *
 * SSR-safe seeding: the store is created per request inside
 * `AppearanceStoreProvider` (`useState`), never as a module singleton written on
 * the server, so the first client render equals the server HTML. `<html>`
 * attributes and `<style id="appearance">` stay server-rendered by
 * `app/layout.tsx`; the store only writes the DOM on client changes.
 * Not persisted in the browser: the server is the source.
 */

/** Debounce for text-size (slider) changes, FE §4.1. The only one: Apariencia's slider relies on it. */
export const TEXT_SIZE_DEBOUNCE_MS = 300;

/** Copy shown on the Tema and Estilo cards when the organization fixed them (FE §3.8, §9). */
export const OVERRIDE_LOCKED_COPY = "La organización fijó el tema y el estilo.";

/** Which Ajustes › Apariencia section an inline error belongs to. */
export type AparienciaSectionKey = "tema" | "estilo" | "modo" | "densidad" | "tamano-texto";

export type SetPreferenceOptions = {
  /**
   * The Apariencia section that made the change: its error is shown inline
   * (`errors[section]`, cleared by the next change of that section) instead of
   * a toast, and `OVERRIDE_DISABLED` locks Tema and Estilo silently.
   */
  section?: AparienciaSectionKey;
};

export type AppearanceState = {
  /** What the page shows: the server-resolved appearance plus any optimistic change. */
  appearance: ResolvedAppearance;
  /**
   * The caller's own preferences (null theme/style = the organization's),
   * optimistic like `appearance` and rolled back with it. Seeded by the root
   * layout; derived from `appearance` when no seed was given.
   */
  preferences: UserPreferences;
  /**
   * Personal theme and style allowed: the organization allows overrides
   * (`!fixedByOrg`) and the server did not answer `OVERRIDE_DISABLED`.
   */
  overridesAllowed: boolean;
  /** Inline error copy per Apariencia section, set by a failed `setPreference(patch, { section })`. */
  errors: Partial<Record<AparienciaSectionKey, string>>;
  /** The organization fixes the presentation style (`allowUserOverride` false). */
  fixedByOrg: boolean;
  /**
   * True when `appearance.style` was seeded as an override by a
   * `StyleProvider` subtree (portal, fixed-style previews, tests). A staff
   * page's `?estilo=` is read from the URL by `useStyle`, never stored here.
   */
  isStyleOverridden: boolean;
  /** Where the style is persisted: user preferences (staff) or the portal cookie. */
  styleScope: StyleScope;
  /**
   * Optimistic; one debounce for text size; persists with
   * `updateMyPreferencesAction`, rolls back the failed fields on error (toast,
   * or `errors[section]` when `options.section` is given).
   */
  setPreference(patch: Partial<UserPreferences>, options?: SetPreferenceOptions): Promise<void>;
  /** Sets or clears (`null`) one section's inline error. */
  setError(section: AparienciaSectionKey, message: string | null): void;
  /** A new server-resolved appearance (a layout re-render, e.g. after an org theme save). */
  applyServer(appearance: ResolvedAppearance): void;
  /**
   * Shows another presentation style at once, without persisting it
   * (`useStyle().setStyle`; `EstiloSwitch` persists it itself).
   */
  setStyle(style: PresentationStyle): void;
};

export type StyleScope = "staff" | "portal";

export type AppearanceStoreOptions = {
  fixedByOrg?: boolean;
  /** The caller's raw preferences; derived from the appearance when omitted. */
  preferences?: UserPreferences | null;
  isStyleOverridden?: boolean;
  styleScope?: StyleScope;
};

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

/** Preferences as an appearance shows them, for a store seeded without the raw row. */
export function preferencesFromAppearance(appearance: ResolvedAppearance): UserPreferences {
  return {
    theme: appearance.theme,
    mode: appearance.mode,
    style: appearance.style,
    density: appearance.density,
    textSize: appearance.textSize,
    quietHours: null,
  };
}

function isTextSizeOnly(patch: Partial<UserPreferences>): boolean {
  const keys = Object.keys(patch);
  return keys.length === 1 && keys[0] === "textSize";
}

/** Per-store internals the provider needs; kept off the state so selectors never see them. */
type StoreInternals = {
  /** A new server seed of the raw preferences (root layout re-render). */
  applyServerPreferences(preferences: UserPreferences): void;
  /** Re-applies the shown appearance (system mode: the OS scheme changed). */
  followSystem(): void;
  /** Identity change: drops the queued changes (never sent under the next session) and shows the confirmed appearance. */
  reset(): void;
  /** Unmount: stops the debounce timer. */
  dispose(): void;
};

const internals = new WeakMap<StoreApi<AppearanceState>, StoreInternals>();

export function createAppearanceStore(
  initial: ResolvedAppearance,
  options: AppearanceStoreOptions = {},
): StoreApi<AppearanceState> {
  /** Last appearance the server confirmed: the rollback target. */
  let committed = initial;
  /** What the page shows now (optimistic included). */
  let shown = initial;
  /** Last preferences the server confirmed, and the shown ones. */
  let committedPrefs = options.preferences ?? preferencesFromAppearance(initial);
  let shownPrefs = committedPrefs;
  /** Changes not sent yet (the debounced text size, or a patch queued while a call runs). */
  let pendingPatch: Partial<UserPreferences> = {};
  /** The Apariencia sections of the queued changes (their errors are inline). */
  let pendingSections = new Set<AparienciaSectionKey>();
  /** A queued change came from outside Apariencia (its error is a toast). */
  let pendingUnsectioned = false;
  let waiters: Array<() => void> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  // Assigned right below; the actions only run after creation.
  let set: StoreApi<AppearanceState>["setState"] = () => undefined;

  const show = (next: ResolvedAppearance, swapStyle: boolean, prefs: UserPreferences = shownPrefs) => {
    shown = next;
    shownPrefs = prefs;
    applyAppearanceToDocument(next, swapStyle);
    set({ appearance: next, preferences: prefs });
  };

  const send = async (patch: Partial<UserPreferences>, sections: Set<AparienciaSectionKey>, unsectioned: boolean) => {
    try {
      const result = await runAction(updateMyPreferencesAction, patch);
      committed = result.appearance;
      committedPrefs = result.preferences;
      getBrowserQueryClient()?.setQueryData(qk.me.preferences(), result.preferences);
      // Keep any change queued while this call was in flight.
      show(optimistic(result.appearance, pendingPatch), true, { ...result.preferences, ...pendingPatch });
    } catch (err) {
      // Roll back only this call's fields: the queued ones stay on top of the confirmed state.
      show(optimistic(committed, pendingPatch), true, { ...committedPrefs, ...pendingPatch });
      const text = mutationErrorText(err);
      if (actionErrorCode(err) === "OVERRIDE_DISABLED" && sections.size > 0) {
        set({ overridesAllowed: false });
      } else if (sections.size > 0) {
        const errors = { ...store.getState().errors };
        for (const section of sections) errors[section] = text;
        set({ errors });
      }
      if (unsectioned) toast.error(text);
    }
  };

  const flush = async () => {
    clearTimer();
    const patch = pendingPatch;
    const sections = pendingSections;
    const unsectioned = pendingUnsectioned;
    const done = waiters;
    pendingPatch = {};
    pendingSections = new Set();
    pendingUnsectioned = false;
    waiters = [];
    if (Object.keys(patch).length > 0) await send(patch, sections, unsectioned);
    for (const resolve of done) resolve();
  };

  const store: StoreApi<AppearanceState> = createStore<AppearanceState>()(() => ({
    appearance: initial,
    preferences: committedPrefs,
    overridesAllowed: !(options.fixedByOrg ?? false),
    errors: {},
    fixedByOrg: options.fixedByOrg ?? false,
    isStyleOverridden: options.isStyleOverridden ?? false,
    styleScope: options.styleScope ?? "staff",
    setPreference(patch, opts = {}) {
      pendingPatch = { ...pendingPatch, ...patch };
      if (opts.section) {
        pendingSections.add(opts.section);
        const errors = store.getState().errors;
        if (errors[opts.section] !== undefined) {
          const next = { ...errors };
          delete next[opts.section];
          set({ errors: next });
        }
      } else {
        pendingUnsectioned = true;
      }
      show(optimistic(shown, patch), false, { ...shownPrefs, ...patch });
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
        if (isTextSizeOnly(patch)) {
          clearTimer();
          timer = setTimeout(() => void flush(), TEXT_SIZE_DEBOUNCE_MS);
        } else {
          void flush();
        }
      });
    },
    setError(section, message) {
      const next = { ...store.getState().errors };
      if (message === null) delete next[section];
      else next[section] = message;
      set({ errors: next });
    },
    applyServer(appearance) {
      committed = appearance;
      shown = appearance;
      set({ appearance });
    },
    setStyle(style) {
      if (shown.style === style) return;
      shown = { ...shown, style };
      set({ appearance: shown });
    },
  }));
  set = store.setState;

  internals.set(store, {
    applyServerPreferences: (preferences) => {
      committedPrefs = preferences;
      shownPrefs = { ...preferences, ...pendingPatch };
      set({ preferences: shownPrefs });
    },
    followSystem: () => applyAppearanceToDocument(shown, false),
    reset: () => {
      clearTimer();
      const done = waiters;
      pendingPatch = {};
      pendingSections = new Set();
      pendingUnsectioned = false;
      waiters = [];
      if (shown !== committed || shownPrefs !== committedPrefs) show(committed, true, committedPrefs);
      set({ errors: {} });
      for (const resolve of done) resolve();
    },
    dispose: clearTimer,
  });

  return store;
}

const AppearanceStoreContext = createContext<StoreApi<AppearanceState> | null>(null);

// No layout effects on the server; the server render never re-seeds.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type AppearanceStoreProviderProps = {
  initial: ResolvedAppearance;
  /** The caller's raw preferences (root layout); null or omitted derives them from `initial`. */
  preferences?: UserPreferences | null;
  fixedByOrg?: boolean;
  /** Nested `StyleProvider` seeds only (see `AppearanceState.isStyleOverridden`). */
  isStyleOverridden?: boolean;
  styleScope?: StyleScope;
  children: ReactNode;
};

/**
 * Creates the store once per mount (per request on the server) from the
 * server-resolved appearance. A new `initial` (`router.refresh`, an org
 * theme save) replaces the shown appearance, as the context did.
 */
export function AppearanceStoreProvider({
  initial,
  preferences,
  fixedByOrg,
  isStyleOverridden,
  styleScope,
  children,
}: AppearanceStoreProviderProps): JSX.Element {
  const [store] = useState(() =>
    createAppearanceStore(initial, { preferences, fixedByOrg, isStyleOverridden, styleScope }),
  );
  const seeded = useRef({
    initial,
    preferences: preferences ?? null,
    fixedByOrg: fixedByOrg ?? false,
    isStyleOverridden: isStyleOverridden ?? false,
    styleScope: styleScope ?? "staff",
  });

  useIsomorphicLayoutEffect(() => {
    const flags = {
      fixedByOrg: fixedByOrg ?? false,
      isStyleOverridden: isStyleOverridden ?? false,
      styleScope: styleScope ?? ("staff" as const),
    };
    const current = seeded.current;
    if (
      current.fixedByOrg !== flags.fixedByOrg ||
      current.isStyleOverridden !== flags.isStyleOverridden ||
      current.styleScope !== flags.styleScope
    ) {
      const fixedChanged = current.fixedByOrg !== flags.fixedByOrg;
      seeded.current = { ...current, ...flags };
      store.setState(fixedChanged ? { ...flags, overridesAllowed: !flags.fixedByOrg } : flags);
    }
    const nextPreferences = preferences ?? null;
    if (nextPreferences && seeded.current.preferences !== nextPreferences) {
      seeded.current.preferences = nextPreferences;
      internals.get(store)?.applyServerPreferences(nextPreferences);
    }
    if (seeded.current.initial === initial) return;
    seeded.current.initial = initial;
    store.getState().applyServer(initial);
  }, [store, initial, preferences, fixedByOrg, isStyleOverridden, styleScope]);

  // System mode: follow the OS while the page is open (the head script did the first paint).
  const mode = useStore(store, (s) => s.appearance.mode);
  useEffect(() => {
    if (mode !== "system" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => internals.get(store)?.followSystem();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [store, mode]);

  // Logout / identity change (plan §4.8): queued changes of the previous viewer are never sent.
  useEffect(() => {
    const unregister = registerUiStoreReset(() => internals.get(store)?.reset());
    return () => {
      unregister();
      internals.get(store)?.dispose();
    };
  }, [store]);

  return createElement(AppearanceStoreContext.Provider, { value: store }, children);
}

function useAppearanceStoreApi(): StoreApi<AppearanceState> {
  const store = useContext(AppearanceStoreContext);
  if (!store) throw new Error("useAppearance must be used inside AppearanceStoreProvider");
  return store;
}

const selectAll = (s: AppearanceState) => s;

/** The appearance store; pass a selector to re-render only on what it returns. */
export function useAppearance(): AppearanceState;
export function useAppearance<T>(selector: (s: AppearanceState) => T): T;
export function useAppearance<T>(selector?: (s: AppearanceState) => T): T | AppearanceState {
  return useStore(useAppearanceStoreApi(), (selector ?? selectAll) as (s: AppearanceState) => T | AppearanceState);
}

/** The store itself, for code that must read it without subscribing (null outside the provider). */
export function useAppearanceStoreApiOrNull(): StoreApi<AppearanceState> | null {
  return useContext(AppearanceStoreContext);
}

const noSubscribe = () => () => undefined;

/**
 * "Ocultar completadas" of the task tables (#1039): the caller's preference
 * and its setter. The setter is optimistic and persists with
 * `updateMyPreferencesAction` (rolled back with a toast on error), so the
 * choice follows the user across reloads and devices. Outside the provider
 * (portal, isolated tests) it reads the default and the setter does nothing.
 */
export function useHideCompletedPreference(): [boolean, (hide: boolean) => void] {
  const store = useAppearanceStoreApiOrNull();
  const hidden = useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    () => store?.getState().preferences.hideCompletedTasks ?? DEFAULT_HIDE_COMPLETED_TASKS,
    () => store?.getState().preferences.hideCompletedTasks ?? DEFAULT_HIDE_COMPLETED_TASKS,
  );
  const setHidden = useCallback(
    (hide: boolean) => {
      if (!store) return;
      if ((store.getState().preferences.hideCompletedTasks ?? DEFAULT_HIDE_COMPLETED_TASKS) === hide) return;
      void store.getState().setPreference({ hideCompletedTasks: hide });
    },
    [store],
  );
  return [hidden, setHidden];
}
