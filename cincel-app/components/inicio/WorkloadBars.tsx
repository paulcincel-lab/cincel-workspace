"use client";

import { PeopleWidget } from "@/components/widgets/PeopleWidget";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import type { PersonDatum } from "@/lib/types/widgets";

import { EmptyWidgetCard } from "./EmptyWidgetCard";

export type WorkloadBarsProps = { people: PersonDatum[] };

const TITLE = "Carga por persona";

/**
 * "Carga por persona" (redesign FE §3.2, §4.3): an instance of `PeopleWidget`
 * in rows with the load (En proceso / Pendiente / Vencida bars, "n tareas"
 * list, or the En proceso / Pendiente / Vencidas / Total table).
 */
export function WorkloadBars({ people }: WorkloadBarsProps) {
  if (people.length === 0) return <EmptyWidgetCard title={TITLE} text="Nadie tiene tareas abiertas." />;
  // `PeopleWidget` has no title of its own; the card gives the section its heading.
  return (
    <WidgetCard title={TITLE}>
      <PeopleWidget people={people} show={["load"]} layout="rows" />
    </WidgetCard>
  );
}
