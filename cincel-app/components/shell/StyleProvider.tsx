"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { PresentationStyle } from "@/lib/types/redesign";

/**
 * The resolved presentation style of the page (redesign FE §4.2, §15.1).
 * `style` comes from the server (`resolvePageStyle` in
 * `lib/ui/style-override.ts`: `?estilo=` override ?? user style when allowed
 * ?? org default); `isOverridden` is true when it came from `?estilo=`.
 * `setStyle` switches the style client-side; persisting it
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
  scope: "staff" | "portal";
  /** True when the organization fixed the style; `EstiloSwitch` is then disabled. */
  isFixed: boolean;
};

const StyleContext = createContext<StyleContextValue | null>(null);

const DEFAULT_STYLE: StyleContextValue = {
  style: "visual",
  setStyle: () => {},
  isOverridden: false,
  scope: "staff",
  isFixed: false,
};

export function StyleProvider(props: {
  style: PresentationStyle;
  scope: "staff" | "portal";
  /** True when `style` came from the `?estilo=` URL override. */
  isOverridden?: boolean;
  /** True when the organization does not allow a personal style (`allowUserOverride` false). */
  fixedByOrg?: boolean;
  children: ReactNode;
}) {
  const initialOverridden = props.isOverridden ?? false;
  const [style, setStyle] = useState<PresentationStyle>(props.style);
  // A new server render (navigation, a different `?estilo=`) resets the client choice.
  const [server, setServer] = useState({ style: props.style, isOverridden: initialOverridden });
  if (server.style !== props.style || server.isOverridden !== initialOverridden) {
    setServer({ style: props.style, isOverridden: initialOverridden });
    setStyle(props.style);
  }

  const isFixed = props.fixedByOrg ?? false;
  const scope = props.scope;
  const value = useMemo<StyleContextValue>(
    () => ({ style, setStyle, isOverridden: initialOverridden, scope, isFixed }),
    [style, initialOverridden, scope, isFixed],
  );
  return <StyleContext.Provider value={value}>{props.children}</StyleContext.Provider>;
}

/** The current style; Visual outside a `StyleProvider`. */
export function useStyle(): StyleContextValue {
  return useContext(StyleContext) ?? DEFAULT_STYLE;
}
