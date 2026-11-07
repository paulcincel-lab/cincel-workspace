"use client";

import { PeopleWidget } from "@/components/widgets/PeopleWidget";
import { teamShow } from "@/lib/personas/team";
import type { PersonDatum } from "@/lib/types/widgets";

export type TeamTableProps = { people: PersonDatum[] };

/**
 * Equipo table (redesign FE §3.6, §4.7): an instance of `PeopleWidget` in
 * rows (abiertas, vencidas, horas semana, % ocupación, proyectos activos,
 * averages row in Analítico). The hours column is present only when the
 * server returned hours (`canViewTeamHours` or self, B4), never because the
 * values are zero.
 */
export function TeamTable({ people }: TeamTableProps) {
  return <PeopleWidget people={people} show={teamShow(people, ["load", "projects"])} layout="rows" />;
}
