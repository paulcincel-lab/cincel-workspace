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

const localeFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * One cached `Intl.DateTimeFormat` per locale and options (no `timeZone`
 * needed: the runtime's own zone). For labels formatted per call, such as
 * calendar titles and event dates.
 */
export function cachedDateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = localeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    localeFormatters.set(key, formatter);
  }
  return formatter;
}

const hourMinuteFormatters = new Map<string, Intl.DateTimeFormat>();

function hourMinuteFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = hourMinuteFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", minute: "2-digit", hourCycle: "h23" });
    hourMinuteFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Hour (0–23, no leading zero) and two-digit minute of `at` in `timeZone`, as `H:mm`. */
export function zonedHourMinute(at: Date, timeZone: string): string {
  const parts = hourMinuteFormatter(timeZone).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/** One es-MX "medium date, short time" formatter in the viewer's time zone ("3 nov 2026, 12:00"). */
const mediumDateTimeFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

/** `at` as an es-MX medium date and short time, in the viewer's time zone. */
export function formatMediumDateTime(at: Date): string {
  return mediumDateTimeFormatter.format(at);
}
