"use client";

import type { ReactNode } from "react";

import { useStyle } from "@/components/shell/StyleProvider";
import type { WidgetView } from "@/lib/stores/dashboard-store";

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

export function StyleView({ visual, esencial, analitico, view }: StyleViewProps) {
  const { style } = useStyle();
  if (view === "chart") return <>{visual()}</>;
  if (view === "table") return <>{analitico()}</>;
  if (style === "esencial") return <>{esencial()}</>;
  if (style === "analitico") return <>{analitico()}</>;
  return <>{visual()}</>;
}
