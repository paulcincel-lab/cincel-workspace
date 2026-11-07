"use client";

import type { PresentationStyle, TeamHoursRow } from "@/lib/types/redesign";

export type TeamHoursTableProps = { weekStart: string; rows: TeamHoursRow[]; style: PresentationStyle };

/**
 * "Horas del equipo" (redesign FE §3.8) on `RecordTable` in three styles.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function TeamHoursTable(props: TeamHoursTableProps) {
  void props;
  return null;
}
