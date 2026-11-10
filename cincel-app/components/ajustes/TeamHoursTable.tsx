"use client";

import { TeamHoursWidget } from "@/components/widgets/TeamHoursWidget";
import { reportDays } from "@/lib/time-tracking/horario-copy";
import type { TeamHoursRow } from "@/lib/types/redesign";

export type TeamHoursTableProps = {
  weekStart: string;
  rows: TeamHoursRow[];
  /** `TimeTrackingSettings.workDays`: the day columns (plus any other day with hours). */
  workDays: number[];
  /** Another week's rows are loading; the shown ones are the previous week's. */
  loading?: boolean;
};

export const TRIAL_NOTE = "Durante la prueba estos datos son informativos y no salen en reportes de nómina.";

/**
 * "Horas del equipo" (canvas `Ajustes-Horario`): the week's day columns and
 * the rows, drawn by `TeamHoursWidget`. The widget reads the presentation
 * style itself, so this component writes no per-style markup.
 * While another week loads, the previous rows stay (marked `aria-busy`).
 */
export function TeamHoursTable({ weekStart, rows, workDays, loading = false }: TeamHoursTableProps) {
  return (
    <div data-week={weekStart} className="flex min-w-0 flex-col gap-2">
      <TeamHoursWidget rows={rows} dates={reportDays(weekStart, workDays, rows)} loading={loading} />
    </div>
  );
}
