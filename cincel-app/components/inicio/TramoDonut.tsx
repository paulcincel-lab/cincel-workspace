"use client";

import { DistributionWidget, type DistributionWidgetProps } from "@/components/widgets/DistributionWidget";

import { EmptyWidgetCard } from "./EmptyWidgetCard";

export type TramoDonutProps = DistributionWidgetProps;

/**
 * "Tareas abiertas por tramo" (redesign FE §3.2, §4.3): an instance of
 * `DistributionWidget` (donut + legend, list, or the table with Vencidas,
 * % venc. heat, Días prom. and the total row).
 */
export function TramoDonut(props: TramoDonutProps) {
  const total = props.segments.reduce((sum, s) => sum + s.value, 0);
  if (props.segments.length === 0 || total === 0) {
    return <EmptyWidgetCard title={props.title} text="No hay tareas abiertas." />;
  }
  return <DistributionWidget {...props} />;
}
