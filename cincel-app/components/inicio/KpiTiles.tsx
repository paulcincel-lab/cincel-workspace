"use client";

import { KpiWidget, type KpiWidgetProps } from "@/components/widgets/KpiWidget";

export type KpiTilesProps = KpiWidgetProps;

/**
 * Inicio KPIs (redesign FE §4.3): an instance of `KpiWidget`. The widget draws
 * the Visual tiles, the Esencial numbers and the Analítico table from the same
 * items and filters `visibleIn` itself; the page never picks the style.
 */
export function KpiTiles(props: KpiTilesProps) {
  return <KpiWidget {...props} />;
}
