"use client";

import { PeopleWidget } from "@/components/widgets/PeopleWidget";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useInicioCollapsible, useInicioWidgetView, WORKLOAD_VIEW } from "@/lib/stores/inicio-dashboard-store";
import type { PersonDatum } from "@/lib/types/widgets";

import { EmptyWidgetCard } from "./EmptyWidgetCard";
import { ViewControl } from "./InicioWidgetControls";

export type WorkloadBarsProps = { people: PersonDatum[] };

const TITLE = "Carga por persona";

/**
 * "Carga por persona" (redesign FE §3.2, §4.3): an instance of `PeopleWidget`
 * in rows with the load (En proceso / Pendiente / Vencida bars, "n tareas"
 * list, or the En proceso / Pendiente / Vencidas / Total table). The card
 * collapses and offers Gráfica / Tabla per style (`useInicioDashboard`);
 * without a pick the widget renders its style's default.
 */
export function WorkloadBars({ people }: WorkloadBarsProps) {
  const collapsible = useInicioCollapsible("workload");
  const { view, override, setView } = useInicioWidgetView("workload", WORKLOAD_VIEW);
  if (people.length === 0) return <EmptyWidgetCard widget="workload" title={TITLE} text="Nadie tiene tareas abiertas." />;
  // `PeopleWidget` has no title of its own; the card gives the section its heading.
  return (
    <WidgetCard title={TITLE} collapsible={collapsible} actions={<ViewControl value={view} onChange={setView} />}>
      <PeopleWidget people={people} show={["load"]} layout="rows" view={override} />
    </WidgetCard>
  );
}
