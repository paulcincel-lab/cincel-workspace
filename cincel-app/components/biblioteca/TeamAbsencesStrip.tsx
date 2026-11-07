"use client";

import type { TeamAbsence } from "@/lib/types/redesign";

/** `month` = "YYYY-MM". */
export type TeamAbsencesStripProps = { month: string; absences: TeamAbsence[] };

/**
 * Team absences of the month (redesign FE §3.7) on `AgendaWidget`; the kind
 * shows only when the server returns it, else "Ausencia".
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function TeamAbsencesStrip(props: TeamAbsencesStripProps) {
  void props;
  return null;
}
