"use client";

import { PeopleWidget } from "@/components/widgets/PeopleWidget";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { initialsOf } from "@/lib/personas/team";
import type { Availability, PersonDatum } from "@/lib/types/widgets";

export type AvailabilityWeekProps = { rows: { staffId: string; name: string; days: Availability[] }[] };

export const AVAILABILITY_LEGEND: { key: Availability; label: string }[] = [
  { key: "libre", label: "Libre" },
  { key: "ocupado", label: "Ocupado" },
  { key: "saturado", label: "Saturado" },
  { key: "vacaciones", label: "Vacaciones" },
];

/**
 * "Disponibilidad esta semana" (redesign FE §3.6, §4.7): an instance of
 * `PeopleWidget` (Mon–Fri availability per person; the widget draws the grid,
 * the sentence or the table per style) with the libre / ocupado / saturado /
 * vacaciones legend. Renders nothing without rows.
 */
export function AvailabilityWeek({ rows }: AvailabilityWeekProps) {
  if (rows.length === 0) return null;
  const people: PersonDatum[] = rows.map((row) => ({
    id: row.staffId,
    name: row.name,
    initials: initialsOf(row.name),
    open: 0,
    overdue: 0,
    availability: row.days,
    href: `/personas/equipo/${row.staffId}`,
  }));
  return (
    <WidgetCard
      title="Disponibilidad esta semana"
      actions={
        <ul aria-label="Leyenda de disponibilidad" className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {AVAILABILITY_LEGEND.map((item) => (
            <li key={item.key}>{item.label}</li>
          ))}
        </ul>
      }
    >
      <PeopleWidget people={people} show={["availability"]} layout="rows" />
    </WidgetCard>
  );
}
