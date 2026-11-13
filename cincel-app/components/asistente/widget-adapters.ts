import type { AttentionItem, DistributionSegment, KpiDatum } from "@/lib/types/widgets";

import type { WidgetTone } from "./tone";

/**
 * Pure mappings from the assistant render-tool arguments (unchanged, see
 * `lib/assistant/tools.ts`) onto the widget library shapes of
 * `lib/types/widgets.ts`. The message components pass the result straight to
 * the library widget; every per-style difference lives in `components/widgets/*`.
 */

/** `render_chart` data point. */
export type ChartDataPoint = { label: string; value: number };

/** `render_stat_grid` stat. */
export type AssistantStat = { label: string; value: string; badge?: { label: string; tone: WidgetTone } };

const CHART_SLOTS = 5;

/** Chart color of the n-th point, cycling the five categorical chart tokens. */
export function chartColorVar(index: number): string {
  return `var(--chart-${(index % CHART_SLOTS) + 1})`;
}

/** `render_chart` points → `DistributionSegment[]` (one chart token per point). */
export function toDistributionSegments(data: ChartDataPoint[]): DistributionSegment[] {
  return data.map((point, index) => ({
    key: `${index}-${point.label}`,
    label: point.label,
    value: point.value,
    colorVar: chartColorVar(index),
  }));
}

/**
 * The number inside a stat value as the model wrote it ("45 %", "$1,200",
 * "3 de 8"): the first signed decimal, thousands separators dropped. 0 when
 * the value holds no number (the widget still shows the original text).
 */
export function parseStatNumber(value: string): number {
  const match = value.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** `render_stat_grid` stats → `KpiDatum[]`; the original text is the `display`, the badge label the caption. */
export function toKpiItems(stats: AssistantStat[]): KpiDatum[] {
  return stats.map((stat, index) => ({
    key: `${index}-${stat.label}`,
    label: stat.label,
    value: parseStatNumber(stat.value),
    display: stat.value,
    ...(stat.badge ? { caption: stat.badge.label } : {}),
  }));
}

/**
 * `render_list` items → `AttentionItem[]`. A list entry is plain text with no
 * task behind it: no link, project, etapa, person or date, neutral tone.
 */
export function toAttentionItems(items: string[]): AttentionItem[] {
  return items.map((item, index) => ({
    id: `${index}`,
    title: item,
    href: "",
    project: "",
    etapa: null,
    reason: "",
    tone: "default",
    assignee: null,
    due: null,
    daysLate: null,
  }));
}
