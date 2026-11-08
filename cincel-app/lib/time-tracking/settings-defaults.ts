/**
 * The Control de horario defaults (redesign BE §4), with no other imports so
 * a client component can read them without pulling in the database.
 * `lib/time-tracking/settings.ts` re-exports them.
 */
import type { TimeTrackingSettings } from "@/lib/types/redesign";

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
