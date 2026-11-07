/**
 * Contrast checker (redesign BE §5.5, §8.2; FE §14.6). Pure and
 * client-importable: one pair list for the theme editor,
 * `saveOrgAppearanceAction` and the presets test. WCAG 2.1 ratios; `rgba`
 * composited over the pair's background; `chart-N-tint` = `chart-N` mixed into
 * `card` in oklab at 14 % (light) / 22 % (dark).
 */
import { notImplemented } from "@/lib/stubs";
import type { OrgAppearance, TokenName } from "@/lib/types/redesign";

export type ChartTint = "chart-1-tint" | "chart-2-tint" | "chart-3-tint" | "chart-4-tint" | "chart-5-tint";

export type ContrastPair = {
  /** e.g. "muted-foreground/card". */
  pair: string;
  fg: TokenName;
  bg: TokenName | ChartTint;
  /** 4.5 for text, 3 for non-text. */
  min: 4.5 | 3;
};

export type ContrastResult = { pair: string; mode: "light" | "dark"; ratio: number; min: number; ok: boolean };

function pair(fg: TokenName, bg: TokenName | ChartTint, min: 4.5 | 3): ContrastPair {
  return { pair: `${fg}/${bg}`, fg, bg, min };
}

const CHART_SLOTS = [1, 2, 3, 4, 5] as const;

/** BE §5.5. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  pair("foreground", "background", 4.5),
  pair("foreground", "card", 4.5),
  pair("muted-foreground", "background", 4.5),
  pair("muted-foreground", "card", 4.5),
  pair("primary-foreground", "primary", 4.5),
  pair("secondary-foreground", "secondary", 4.5),
  pair("destructive", "card", 4.5),
  pair("destructive", "background", 4.5),
  pair("success", "card", 4.5),
  pair("warning-ink", "card", 4.5),
  pair("sidebar-foreground", "sidebar", 4.5),
  pair("sidebar-primary-foreground", "sidebar-primary", 4.5),
  ...CHART_SLOTS.map((n) => pair(`chart-${n}-ink` as const, `chart-${n}-tint` as const, 4.5)),
  ...CHART_SLOTS.map((n) => pair(`chart-${n}` as const, "card", 3)),
  pair("border-strong", "card", 3),
  pair("ring", "background", 3),
];

/** One result per pair of `CONTRAST_PAIRS` for the given mode. */
export function checkContrast(tokens: OrgAppearance["tokens"], mode: "light" | "dark"): ContrastResult[] {
  return notImplemented("checkContrast", tokens, mode);
}
