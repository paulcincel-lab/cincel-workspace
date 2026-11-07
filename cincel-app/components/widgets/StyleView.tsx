"use client";

import type { ReactNode } from "react";

import { useStyle } from "@/components/shell/StyleProvider";

/**
 * Renders exactly one of the three style branches for the current style
 * (redesign FE §4.2, §15.1). Importable only inside `components/widgets/*`
 * (guard test).
 */
export type StyleViewProps = {
  visual: () => ReactNode;
  esencial: () => ReactNode;
  analitico: () => ReactNode;
};

export function StyleView({ visual, esencial, analitico }: StyleViewProps) {
  const { style } = useStyle();
  if (style === "esencial") return <>{esencial()}</>;
  if (style === "analitico") return <>{analitico()}</>;
  return <>{visual()}</>;
}
