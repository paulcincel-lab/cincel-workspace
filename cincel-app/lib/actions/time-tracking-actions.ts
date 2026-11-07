"use server";

import { notImplementedAction, stubDefault } from "@/lib/stubs";
import { DEFAULT_TIME_TRACKING_SETTINGS } from "@/lib/time-tracking/settings";
import type {
  TeamHoursRow,
  TimeEntrySource,
  TimeTrackingSettings,
  TodayStatus,
  WeekHours,
} from "@/lib/types/redesign";

/**
 * Control de horario (redesign BE §7.7, §8.7). Phase 1 stubs report time
 * tracking as disabled, so the sidebar clock and the login prompt stay hidden.
 */

const DISABLED_TODAY: TodayStatus = {
  state: "off",
  startedAt: null,
  workedSeconds: 0,
  required: false,
  promptAtLogin: false,
  enabled: false,
  requiredFrom: null,
  hoursPerDay: DEFAULT_TIME_TRACKING_SETTINGS.hoursPerDay,
};

/** Org settings (seeded disabled). Auth: staff. */
export async function fetchTimeTrackingSettingsAction(): Promise<TimeTrackingSettings> {
  return stubDefault({ ...DEFAULT_TIME_TRACKING_SETTINGS });
}

/**
 * Auth: `canManageTimeTracking`. Errors: `FORBIDDEN`, `INVALID` (dayEnd ≤
 * dayStart; hoursPerDay ∉ 1–12; workDays empty or ∉ 0–6; unknown exempt role;
 * a changed `requiredFrom` earlier than tomorrow). Revalidates `/` (layout), `/ajustes/horario`.
 */
export async function saveTimeTrackingSettingsAction(input: TimeTrackingSettings): Promise<TimeTrackingSettings> {
  return notImplementedAction("saveTimeTrackingSettingsAction", input);
}

/** The caller's day (incl. `requiredFrom`, `hoursPerDay`). Auth: staff. */
export async function fetchMyTodayAction(): Promise<TodayStatus> {
  return stubDefault({ ...DISABLED_TODAY });
}

/** off | done → on. Errors: `DISABLED` (off or exempt), `ALREADY_ON`. */
export async function clockInAction(input: { source: TimeEntrySource }): Promise<TodayStatus> {
  return notImplementedAction("clockInAction", input);
}

/** on → pausa. Errors: `NOT_ON`. */
export async function pauseWorkAction(): Promise<TodayStatus> {
  return notImplementedAction("pauseWorkAction");
}

/** pausa → on. Errors: `NOT_ON`. */
export async function resumeWorkAction(): Promise<TodayStatus> {
  return notImplementedAction("resumeWorkAction");
}

/** on | pausa → done (closes an open pause first). Errors: `NOT_ON`. */
export async function clockOutAction(): Promise<TodayStatus> {
  return notImplementedAction("clockOutAction");
}

/** Active, non-exempt staff for the week starting `weekStart` (a Monday). Auth: `canViewTeamHours`. Errors: `FORBIDDEN`, `INVALID`. */
export async function fetchTeamHoursAction(input: { weekStart: string }): Promise<TeamHoursRow[]> {
  return stubDefault<TeamHoursRow[]>([], input);
}

/** The caller's current week, Mon–Sun (used by Perfil). Auth: staff. */
export async function fetchMyWeekHoursAction(): Promise<WeekHours> {
  return stubDefault<WeekHours>({ days: [], total: 0, target: 0 });
}
