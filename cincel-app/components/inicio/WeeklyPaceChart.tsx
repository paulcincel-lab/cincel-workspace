"use client";

import type { InicioData } from "@/lib/types/redesign";

export type WeeklyPaceChartProps = { weeks: InicioData["weeklyPace"] };

/**
 * "Ritmo semanal" line chart, 8 weeks (redesign FE §3.2, §4.3): `WidgetCard` +
 * shadcn `ChartContainer`; Analítico through `RecordTable`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function WeeklyPaceChart(props: WeeklyPaceChartProps) {
  void props;
  return null;
}
