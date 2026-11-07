"use client";

import { KpiWidget } from "@/components/widgets/KpiWidget";
import { WidgetCard } from "@/components/widgets/WidgetCard";

import { toKpiItems, type AssistantStat } from "./widget-adapters";

type Props = {
  title?: string;
  stats: AssistantStat[];
};

/**
 * `render_stat_grid` (redesign FE §3.9, §4.11.1): several comparable metrics
 * as a library `KpiWidget` (tiles, number grid or table per the user's style),
 * inside a `WidgetCard` when the tool sends a title.
 */
export function AssistantStatGridMessage({ title, stats }: Props) {
  const kpis = <KpiWidget items={toKpiItems(stats)} />;
  return title ? <WidgetCard title={title}>{kpis}</WidgetCard> : kpis;
}
