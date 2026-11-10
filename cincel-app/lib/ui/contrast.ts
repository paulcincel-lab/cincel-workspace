/**
 * Contrast checker (redesign BE §5.5, §8.2; FE §14.6). Pure and
 * client-importable: one pair list for the theme editor,
 * `saveOrgAppearanceAction` and the presets test. WCAG 2.1 ratios; `rgba`
 * composited over the pair's background; `chart-N-tint` = `chart-N` mixed into
 * `card` in oklab at 14 % (light) / 22 % (dark).
 */
import type { OrgAppearance, TokenName } from "@/lib/types/redesign";
import { compositeOver, mixOklab, requireColor, srgbToLinear, TINT_PERCENT, type Rgba } from "@/lib/ui/tints";

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

/** BE §5.5, plus the named tints, `destructive-ink` and `foreground-soft` (Estilos). */
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
  pair("secondary-foreground", "tint-primary", 4.5),
  pair("chart-2-ink", "tint-violet", 4.5),
  pair("warning-ink", "tint-warning", 4.5),
  pair("chart-4-ink", "tint-cyan", 4.5),
  pair("destructive-ink", "tint-destructive", 4.5),
  pair("success", "tint-success", 4.5),
  pair("foreground-soft", "card", 4.5),
  pair("foreground-soft", "background", 4.5),
  pair("foreground-soft", "muted", 4.5),
  ...CHART_SLOTS.map((n) => pair(`chart-${n}` as const, "card", 3)),
  pair("border-strong", "card", 3),
  pair("ring", "background", 3),
];

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

/** WCAG 2.1 relative luminance of an opaque sRGB color. */
export function relativeLuminance(color: Rgba): number {
  return 0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b);
}

/** WCAG 2.1 contrast ratio of two opaque colors (unrounded). */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Resolves a pair's background to an opaque color. A translucent token is
 * composited over the page `background`, and that one over white (light) or
 * black (dark). Tints are mixed into `card` in oklab (FE §14.5).
 */
function resolveBackground(tokens: OrgAppearance["tokens"], bg: TokenName | ChartTint, mode: "light" | "dark"): Rgba {
  const canvas = mode === "light" ? WHITE : BLACK;
  const page = compositeOver(requireColor(tokens.background[mode]), canvas);
  if (bg === "background") return page;
  const card = compositeOver(requireColor(tokens.card[mode]), page);
  if (bg === "card") return card;
  const tint = /^chart-([1-5])-tint$/.exec(bg);
  if (tint) {
    const chart = requireColor(tokens[`chart-${tint[1]}` as TokenName][mode]);
    return compositeOver(mixOklab(chart, card, TINT_PERCENT[mode]), card);
  }
  return compositeOver(requireColor(tokens[bg as TokenName][mode]), page);
}

/** One result per pair of `CONTRAST_PAIRS` for the given mode. */
export function checkContrast(tokens: OrgAppearance["tokens"], mode: "light" | "dark"): ContrastResult[] {
  return CONTRAST_PAIRS.map((p) => {
    const background = resolveBackground(tokens, p.bg, mode);
    const foreground = compositeOver(requireColor(tokens[p.fg][mode]), background);
    const raw = contrastRatio(foreground, background);
    return { pair: p.pair, mode, ratio: Math.round(raw * 100) / 100, min: p.min, ok: raw >= p.min };
  });
}

/** Both modes, light first. */
export function checkContrastBothModes(tokens: OrgAppearance["tokens"]): ContrastResult[] {
  return [...checkContrast(tokens, "light"), ...checkContrast(tokens, "dark")];
}

/**
 * The `LOW_CONTRAST: <pair> <mode> <ratio>[, …]` error message (BE §7.1,
 * §8.2) for the failing results, or `null` when every pair passes.
 */
export function lowContrastMessage(results: readonly ContrastResult[]): string | null {
  const failing = results.filter((r) => !r.ok);
  if (failing.length === 0) return null;
  return `LOW_CONTRAST: ${failing.map((r) => `${r.pair} ${r.mode} ${r.ratio.toFixed(2)}`).join(", ")}`;
}
