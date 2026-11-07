/**
 * The "hoy y mañana" window of the Mi espacio reminders column (redesign FE
 * §3.3): from local midnight today to the last millisecond of tomorrow, in the
 * organization time zone. The page load and the client refetch after a
 * capture ask `fetchRemindersAction` for the same window. Pure and client-safe.
 */
import { REMINDER_TIME_ZONE, addDaysToDateKey, zonedDateKey, zonedInputsToIso } from "./reminder-time";

/** ISO bounds (inclusive) of today and tomorrow in `timeZone`. */
export function todayTomorrowRange(now: Date, timeZone: string = REMINDER_TIME_ZONE): { from: string; to: string } {
  const today = zonedDateKey(now, timeZone);
  const from = zonedInputsToIso(today, "00:00", timeZone) as string;
  const end = zonedInputsToIso(addDaysToDateKey(today, 2), "00:00", timeZone) as string;
  return { from, to: new Date(Date.parse(end) - 1).toISOString() };
}
