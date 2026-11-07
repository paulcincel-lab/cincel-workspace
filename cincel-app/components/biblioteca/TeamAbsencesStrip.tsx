"use client";

import { AgendaWidget } from "@/components/widgets/AgendaWidget";
import type { TeamAbsence } from "@/lib/types/redesign";

import { absencesToAgendaItems, formatMonthName } from "./vacation-format";

/** `month` = "YYYY-MM". */
export type TeamAbsencesStripProps = { month: string; absences: TeamAbsence[] };

/**
 * Team absences of the month (redesign FE §3.7) on `AgendaWidget` in month
 * mode; the kind shows only when the server returns it (owner and
 * `canDecideVacations`, B12), else "Ausencia".
 */
export function TeamAbsencesStrip({ month, absences }: TeamAbsencesStripProps) {
  return (
    <AgendaWidget
      title={`Quién está fuera · ${formatMonthName(month)}`}
      items={absencesToAgendaItems(absences)}
      mode="month"
      groupBy="none"
      emptyText="Nadie del equipo está fuera este mes."
    />
  );
}
