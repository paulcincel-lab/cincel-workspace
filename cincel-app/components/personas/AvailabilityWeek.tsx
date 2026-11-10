"use client";

import { Button } from "@/components/ui/shadcn/button";
import { PeopleWidget } from "@/components/widgets/PeopleWidget";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { initialsOf } from "@/lib/personas/team";
import { usePersonasDashboard } from "@/lib/stores/personas-dashboard-store";
import type { Availability, PersonDatum } from "@/lib/types/widgets";

export type AvailabilityWeekProps = { rows: { staffId: string; name: string; days: Availability[] }[] };

export const AVAILABILITY_LEGEND: { key: Availability; label: string }[] = [
  { key: "libre", label: "Libre" },
  { key: "ocupado", label: "Ocupado" },
  { key: "saturado", label: "Saturado" },
  { key: "vacaciones", label: "Vacaciones" },
];

/**
 * Legend of "Disponibilidad esta semana": each item is a toggle button that
 * filters the team to the people with that availability on at least one day
 * (`usePersonasDashboard.selectedKpi`, session only; the same item again
 * clears it). Filters data already loaded; no server call.
 */
export function AvailabilityLegendFilter() {
  const selected = usePersonasDashboard((s) => s.selectedKpi);
  const toggleKpi = usePersonasDashboard((s) => s.toggleKpi);
  return (
    <ul aria-label="Leyenda de disponibilidad" className="flex flex-wrap gap-1 text-xs text-muted-foreground">
      {AVAILABILITY_LEGEND.map((item) => (
        <li key={item.key}>
          <Button
            type="button"
            size="xs"
            variant={selected === item.key ? "secondary" : "ghost"}
            aria-pressed={selected === item.key}
            title={`Mostrar en el equipo solo a quien tiene «${item.label}» algún día`}
            onClick={() => toggleKpi(item.key)}
          >
            {item.label}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Disponibilidad esta semana" (redesign FE §3.6, §4.7): an instance of
 * `PeopleWidget` (Mon–Fri availability per person; the widget draws the grid,
 * the sentence or the table per style) with the libre / ocupado / saturado /
 * vacaciones legend as team filter and a collapse toggle (persisted in
 * `usePersonasDashboard`). Renders nothing without rows.
 */
export function AvailabilityWeek({ rows }: AvailabilityWeekProps) {
  const collapsed = usePersonasDashboard((s) => s.collapsed.availability ?? false);
  const toggleCollapsed = usePersonasDashboard((s) => s.toggleCollapsed);
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
      collapsible={{ collapsed, onToggle: () => toggleCollapsed("availability") }}
      actions={<AvailabilityLegendFilter />}
    >
      <PeopleWidget people={people} show={["availability"]} layout="rows" />
    </WidgetCard>
  );
}
