"use client";

import type { TeamHoursRow, TimeTrackingSettings } from "@/lib/types/redesign";

export type HorarioClientProps = {
  settings: TimeTrackingSettings;
  canManage: boolean;
  canViewReport: boolean;
  weekStart: string;
  rows: TeamHoursRow[];
};

/**
 * Ajustes › Control de horario (redesign FE §3.8): settings sections for
 * `canManageTimeTracking`, the team report for `canViewTeamHours`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function HorarioClient(props: HorarioClientProps) {
  void props;
  return null;
}
