import { zonedIsoDate } from "@/lib/dates/zoned-formatters";

/** The project's timezone for "today": every viewer gets the same date and week regardless of their own clock. */
export const SCHEDULE_TIMEZONE = "America/Mexico_City";

/** Today in the schedule timezone, as `YYYY-MM-DD` (one cached formatter, `lib/dates/zoned-formatters.ts`). */
export function scheduleToday(at: Date = new Date()): string {
  return zonedIsoDate(at, SCHEDULE_TIMEZONE);
}
