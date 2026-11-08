"use client";

import { DistributionWidget, type DistributionWidgetProps } from "@/components/widgets/DistributionWidget";
import { TRAMO_VIEW, useInicioCollapsible, useInicioWidgetView } from "@/lib/stores/inicio-dashboard-store";

import { EmptyWidgetCard } from "./EmptyWidgetCard";
import { ViewControl } from "./InicioWidgetControls";

export type TramoDonutProps = Omit<DistributionWidgetProps, "view" | "actions" | "collapsible">;

/**
 * "Tareas abiertas por tramo" (redesign FE §3.2, §4.3): an instance of
 * `DistributionWidget` (donut + legend, list, or the table with Vencidas,
 * % venc. heat, Días prom. and the total row). The card collapses and offers
 * Gráfica / Tabla per style (`useInicioDashboard`); without a pick the widget
 * renders its style's default.
 */
export function TramoDonut(props: TramoDonutProps) {
  const collapsible = useInicioCollapsible("tramoDonut");
  const { view, override, setView } = useInicioWidgetView("tramoDonut", TRAMO_VIEW);
  const total = props.segments.reduce((sum, s) => sum + s.value, 0);
  if (props.segments.length === 0 || total === 0) {
    return <EmptyWidgetCard widget="tramoDonut" title={props.title} text="No hay tareas abiertas." />;
  }
  return (
    <DistributionWidget
      {...props}
      view={override}
      collapsible={collapsible}
      actions={<ViewControl value={view} onChange={setView} />}
    />
  );
}
