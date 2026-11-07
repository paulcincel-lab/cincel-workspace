/**
 * Control de horario settings (redesign BE §3.12, §7.7): `app_settings('time_tracking')`,
 * versioned `{ version: 1, data }` like `general_settings`.
 */
import { notImplemented } from "@/lib/stubs";
import type { TimeTrackingSettings } from "@/lib/types/redesign";

export const TIME_TRACKING_SETTING_KEY = "time_tracking";

/** The seeded value (BE §4); also the fallback when the row is missing or unreadable. */
export const DEFAULT_TIME_TRACKING_SETTINGS: TimeTrackingSettings = {
  enabled: false,
  requiredFrom: null,
  dayStart: "09:00",
  dayEnd: "18:00",
  hoursPerDay: 8,
  lateToleranceMin: 15,
  workDays: [1, 2, 3, 4, 5],
  promptAtLogin: true,
  autoCloseAt: "20:00",
  lunchMinutes: 60,
  exemptRoles: [],
};

/** Time zone of every local-day comparison (BE §8.7). */
export const TIME_TRACKING_TIME_ZONE = "America/Mexico_City";

export async function getTimeTrackingSettings(): Promise<TimeTrackingSettings> {
  return notImplemented("getTimeTrackingSettings");
}
