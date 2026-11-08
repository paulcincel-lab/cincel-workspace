"use client";

import { useMemo, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import { useShallow } from "zustand/react/shallow";

import {
  AppearanceStoreProvider,
  createAppearanceStore,
  useAppearanceStoreApiOrNull,
  type AppearanceState,
  type StyleScope,
} from "@/lib/stores/appearance-store";
import type { PresentationStyle, ResolvedAppearance } from "@/lib/types/redesign";
import { resolveAppearance } from "@/lib/ui/preferences";
import { DEFAULT_ORG_APPEARANCE } from "@/lib/ui/themes";

/**
 * The presentation style of the page (redesign FE §4.2, §15.1), read from the
 * `useAppearance` store (zustand.md §2.6, decision D2). There is no style
 * context: `style` and `fixedByOrg` come from the store the root layout
 * seeds; `setStyle` switches the style client-side; persisting it
 * (`updateMyPreferencesAction` for staff, the `cincel-portal-style` cookie for
 * the portal) belongs to `EstiloSwitch`.
 *
 * Reads and sets the style but renders no per-style markup (guard allowlist,
 * FE §17).
 */
export type StyleContextValue = {
  style: PresentationStyle;
  setStyle(style: PresentationStyle): void;
  isOverridden: boolean;
  /** Where the style is persisted: user preferences (staff) or the portal cookie. */
  scope: StyleScope;
  /** True when the organization fixed the style; `EstiloSwitch` is then disabled. */
  isFixed: boolean;
};

/** What a tree without any appearance store renders: Visual, nothing fixed, a no-op `setStyle`. */
const DEFAULT_APPEARANCE: ResolvedAppearance = {
  ...resolveAppearance({ ...DEFAULT_ORG_APPEARANCE, v: 1 }, null),
  style: "visual",
};

let fallbackStore: StoreApi<AppearanceState> | null = null;

/** Read-only store for trees rendered outside `AppearanceStoreProvider`; its setters do nothing. */
function getFallbackStore(): StoreApi<AppearanceState> {
  if (!fallbackStore) {
    fallbackStore = createAppearanceStore(DEFAULT_APPEARANCE);
    fallbackStore.setState({ setStyle: () => {}, setPreference: async () => {}, applyServer: () => {} });
  }
  return fallbackStore;
}

const selectStyle = (s: AppearanceState): StyleContextValue => ({
  style: s.appearance.style,
  setStyle: s.setStyle,
  isOverridden: s.isStyleOverridden,
  scope: s.styleScope,
  isFixed: s.fixedByOrg,
});

/** The current style from the nearest appearance store; Visual outside any store. */
export function useStyle(): StyleContextValue {
  const store = useAppearanceStoreApiOrNull() ?? getFallbackStore();
  return useStore(store, useShallow(selectStyle));
}

export type StyleProviderProps = {
  style: PresentationStyle;
  scope: StyleScope;
  /** True when `style` came from the `?estilo=` URL override. */
  isOverridden?: boolean;
  /** True when the organization does not allow a personal style (`allowUserOverride` false). */
  fixedByOrg?: boolean;
  children: ReactNode;
};

/**
 * Transitional seed for the nested page wrappers (Phase 2, #936, deletes
 * them). It holds no context of its own:
 *
 * - Inside the root store, a staff wrapper without an active `?estilo=`
 *   override renders its children as they are: the page reads the root
 *   store, so a style change on one page is seen by the next one. When the
 *   organization fixed the style, the override is ignored the same way.
 * - With an active override, on the portal (its style is the cookie, not the
 *   staff preference) or outside any store, it seeds a store for its subtree
 *   from the surrounding appearance with `style` in place.
 */
export function StyleProvider(props: StyleProviderProps) {
  const parent = useAppearanceStoreApiOrNull();
  const store = parent ?? getFallbackStore();
  const parentAppearance = useStore(store, (s) => s.appearance);
  const parentFixed = useStore(store, (s) => s.fixedByOrg);

  const fixedByOrg = props.fixedByOrg ?? parentFixed;
  const overridden = (props.isOverridden ?? false) && !(parent !== null && fixedByOrg);
  const passThrough = parent !== null && props.scope === "staff" && !overridden;

  const initial = useMemo<ResolvedAppearance>(
    () => ({ ...parentAppearance, style: props.style }),
    [parentAppearance, props.style],
  );

  if (passThrough) return <>{props.children}</>;
  return (
    <AppearanceStoreProvider
      initial={initial}
      fixedByOrg={fixedByOrg}
      isStyleOverridden={overridden}
      styleScope={props.scope}
    >
      {props.children}
    </AppearanceStoreProvider>
  );
}
