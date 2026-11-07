"use client";

import { createContext, useContext } from "react";

import type { TeamHoursRow, TimeTrackingSettings } from "@/lib/types/redesign";

/**
 * Page state of Ajustes › Control de horario, held by `HorarioClient` and read
 * by the sections of `lib/shell/settings-sections/horario/*`.
 */
export type HorarioContextValue = {
  /** The last saved settings. */
  saved: TimeTrackingSettings;
  /** The settings being edited (equal to `saved` for read-only viewers). */
  draft: TimeTrackingSettings;
  update(patch: Partial<TimeTrackingSettings>): void;
  /** `canManageTimeTracking`: switch, rules form, prompt preview. */
  canManage: boolean;
  /** `canViewTeamHours`: the weekly report and the CSV export. */
  canViewReport: boolean;
  /** `canManage` and the save action is implemented. */
  editable: boolean;
  weekStart: string;
  rows: TeamHoursRow[];
  /** Local date (America/Mexico_City) of the viewer's today. */
  today: string;
  viewerName: string;
};

export const HorarioContext = createContext<HorarioContextValue | null>(null);

export function useHorario(): HorarioContextValue {
  const value = useContext(HorarioContext);
  if (!value) throw new Error("Control de horario sections render inside HorarioClient.");
  return value;
}
