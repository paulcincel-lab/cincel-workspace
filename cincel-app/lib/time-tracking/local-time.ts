/**
 * Local-day arithmetic of Control de horario (redesign BE §8.7): every work
 * day and every day/time comparison is made in `America/Mexico_City`.
 * Calendar dates are `YYYY-MM-DD` strings handled as UTC midnights, so no
 * server clock leaks in. Pure and client-safe.
 */
import { localIsoDate, TASK_TREND_TIME_ZONE } from "@/lib/dashboard/task-trend";
import { zonedHourMinute } from "@/lib/dates/zoned-formatters";

/** Time zone of every local-day comparison (reuses the dashboard trend constant). */
export const TIME_TRACKING_TIME_ZONE = TASK_TREND_TIME_ZONE;

const DAY_MS = 86_400_000;

/** The local calendar date of `at`. */
export function localDate(at: Date): string {
  return localIsoDate(at, TIME_TRACKING_TIME_ZONE);
}

/**
 * The local wall-clock time of `at` as `HH:MM` (00:00–23:59). Uses the
 * cached formatter of `lib/dates/zoned-formatters.ts`: the team-hours report
 * calls this per entry.
 */
export function localHourMinute(at: Date): string {
  const [hour = "0", minute = "00"] = zonedHourMinute(at, TIME_TRACKING_TIME_ZONE).split(":");
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/** Day of week of a calendar date: 0 = domingo … 6 = sábado. */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** `date` plus `days` calendar days. */
export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday of the week (Mon–Sun) that holds `date`. */
export function mondayOf(date: string): string {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}

/** The seven dates of the week starting on `monday`. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
