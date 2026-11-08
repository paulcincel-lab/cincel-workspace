"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { ajustesHorarioOptions, type AjustesHorarioPageData } from "@/lib/query/options/ajustes";
import { useHorarioForm } from "@/lib/stores/ajustes/horario-form-store";
import { DEFAULT_TIME_TRACKING_SETTINGS } from "@/lib/time-tracking/settings-defaults";
import type { TeamHoursRow, TimeTrackingSettings } from "@/lib/types/redesign";

/**
 * Page state of Ajustes › Control de horario for the sections of
 * `lib/shell/settings-sections/horario/*`. No React context: the draft,
 * errors and week come from the page-scoped `HorarioFormStoreProvider`
 * (rendered by `HorarioClient`), the saved settings and the report from
 * `qk.ajustes.page('horario', { weekStart })`, which the page hydrates for
 * the current week. Another week keeps the previous page on screen while it
 * loads (`keepPreviousData`).
 */
export type HorarioPageState = {
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
  setWeekStart(weekStart: string): void;
  rows: TeamHoursRow[];
  /** The rows of another week are loading (the previous ones stay shown). */
  loadingWeek: boolean;
  /** Local date (America/Mexico_City) of the viewer's today. */
  today: string;
  viewerName: string;
};

/** Until the page data is in the cache: nothing editable, nothing to report. */
const NO_PAGE: AjustesHorarioPageData = {
  settings: DEFAULT_TIME_TRACKING_SETTINGS,
  rows: [],
  canManage: false,
  canViewReport: false,
};

/** The page data of the week the report shows. */
export function useHorarioPageData(): { data: AjustesHorarioPageData; loadingWeek: boolean } {
  const weekStart = useHorarioForm((s) => s.weekStart);
  const { data, isPlaceholderData } = useQuery({
    ...ajustesHorarioOptions(weekStart),
    placeholderData: keepPreviousData,
  });
  return { data: data ?? NO_PAGE, loadingWeek: isPlaceholderData };
}

export function useHorario(): HorarioPageState {
  const { data, loadingWeek } = useHorarioPageData();
  const draft = useHorarioForm((s) => s.draft);
  const update = useHorarioForm((s) => s.setField);
  const weekStart = useHorarioForm((s) => s.weekStart);
  const setWeekStart = useHorarioForm((s) => s.setWeekStart);
  const today = useHorarioForm((s) => s.today);
  const viewerName = useHorarioForm((s) => s.viewerName);
  const editable = data.canManage && IMPLEMENTED.saveTimeTrackingSettingsAction;
  return {
    saved: data.settings,
    draft: editable ? draft : data.settings,
    update,
    canManage: data.canManage,
    canViewReport: data.canViewReport,
    editable,
    weekStart,
    setWeekStart,
    rows: data.rows,
    loadingWeek,
    today,
    viewerName,
  };
}
