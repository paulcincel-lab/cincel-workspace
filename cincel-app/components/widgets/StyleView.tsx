"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useStyle } from "@/components/shell/StyleProvider";
import type { WidgetView } from "@/lib/stores/dashboard-store";
import type { PresentationStyle } from "@/lib/types/redesign";

/**
 * Renders exactly one of the three style branches for the current style
 * (redesign FE §4.2, §15.1). Importable only inside `components/widgets/*`
 * (guard test).
 *
 * `view` (a dashboard's chart/table pick, `useWidgetView`) wins over the
 * style: "chart" renders the Visual branch, "table" the Analítico one.
 */
export type StyleViewProps = {
  visual: () => ReactNode;
  esencial: () => ReactNode;
  analitico: () => ReactNode;
  view?: WidgetView;
};

/** The branch the nearest `StyleView` rendered; null outside any `StyleView`. */
const StyleBranchContext = createContext<PresentationStyle | null>(null);

/**
 * The style branch a widget part is rendered in: the nearest `StyleView`'s
 * branch (so a `view` override counts), else the page style. Lets shared
 * parts such as `Sparkline` animate only inside a Visual branch.
 */
export function useStyleBranch(): PresentationStyle {
  const branch = useContext(StyleBranchContext);
  const { style } = useStyle();
  return branch ?? style;
}

function branchOf(style: PresentationStyle, view: WidgetView | undefined): PresentationStyle {
  if (view === "chart") return "visual";
  if (view === "table") return "analitico";
  return style;
}

export function StyleView({ visual, esencial, analitico, view }: StyleViewProps) {
  const { style } = useStyle();
  const branch = branchOf(style, view);
  const render = branch === "esencial" ? esencial : branch === "analitico" ? analitico : visual;
  return <StyleBranchContext.Provider value={branch}>{render()}</StyleBranchContext.Provider>;
}
