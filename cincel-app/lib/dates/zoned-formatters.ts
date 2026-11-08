/**
 * Cached `Intl.DateTimeFormat` instances for time-zone date math.
 *
 * Building a formatter with a `timeZone` is expensive (tens of microseconds),
 * and dashboard aggregates call these helpers per task per day. Reusing one
 * formatter per time zone keeps those loops fast.
 */

const isoDateFormatters = new Map<string, Intl.DateTimeFormat>();
const isoMinuteFormatters = new Map<string, Intl.DateTimeFormat>();

function isoDateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = isoDateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    isoDateFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function isoMinuteFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = isoMinuteFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    isoMinuteFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Calendar date of `at` in `timeZone`, as `YYYY-MM-DD`. */
export function zonedIsoDate(at: Date, timeZone: string): string {
  return isoDateFormatter(timeZone).format(at);
}

/** Local date and minute of `at` in `timeZone`, as `YYYY-MM-DDTHH:mm`. */
export function zonedIsoMinute(at: Date, timeZone: string): string {
  const parts = isoMinuteFormatter(timeZone).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
