"use client";

import type { Availability } from "@/lib/types/widgets";

export type AvailabilityWeekProps = { rows: { staffId: string; name: string; days: Availability[] }[] };

/**
 * "Disponibilidad esta semana" grid (redesign FE §4.7): an instance of
 * `PeopleWidget`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function AvailabilityWeek(props: AvailabilityWeekProps) {
  void props;
  return null;
}
