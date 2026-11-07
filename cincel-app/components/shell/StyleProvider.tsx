"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { PresentationStyle } from "@/lib/types/redesign";

/**
 * The resolved presentation style of the page (redesign FE §4.2, §15.1).
 * `style` comes from the server (`?estilo=` override ?? user style when
 * allowed ?? org default); `isOverridden` is true when it came from `?estilo=`.
 * `setStyle` switches the style client-side; persisting it through
 * `updateMyPreferencesAction` belongs to `EstiloSwitch`.
 */
type StyleContextValue = {
  style: PresentationStyle;
  setStyle(style: PresentationStyle): void;
  isOverridden: boolean;
};

const StyleContext = createContext<StyleContextValue | null>(null);

const DEFAULT_STYLE: StyleContextValue = { style: "visual", setStyle: () => {}, isOverridden: false };

export function StyleProvider(props: {
  style: PresentationStyle;
  scope: "staff" | "portal";
  /** True when `style` came from the `?estilo=` URL override. */
  isOverridden?: boolean;
  children: ReactNode;
}) {
  const [style, setStyle] = useState<PresentationStyle>(props.style);
  const isOverridden = props.isOverridden ?? false;
  const value = useMemo(() => ({ style, setStyle, isOverridden }), [style, isOverridden]);
  return <StyleContext.Provider value={value}>{props.children}</StyleContext.Provider>;
}

/** The current style; Visual outside a `StyleProvider`. */
export function useStyle(): StyleContextValue {
  return useContext(StyleContext) ?? DEFAULT_STYLE;
}
