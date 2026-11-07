/**
 * Wall-clock helpers for reminders (redesign BE §8.4, §8.5, §9.4): `dueAt` is
 * stored in UTC and read, parsed and advanced in the org time zone. Pure, no
 * dependencies (Intl only).
 */

/** The org time zone (`general_settings.regional.timeZone` only allows this value). */
export const ORG_TIME_ZONE = "America/Mexico_City";

export type LocalDate = { year: number; month: number; day: number };
export type LocalDateTime = LocalDate & { hour: number; minute: number; second: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Calendar date and wall time of `at` in `tz`. */
export function localParts(at: Date, tz: string): LocalDateTime {
  const parts: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(at)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour === 24 ? 0 : parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/** Offset of `tz` from UTC at `at`, in ms (local − UTC). */
function offsetMs(at: Date, tz: string): number {
  const p = localParts(at, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant whose wall time in `tz` is the given local date and time. */
export function zonedTimeToUtc(date: LocalDate, hour: number, minute: number, tz: string, second = 0): Date {
  const guess = Date.UTC(date.year, date.month - 1, date.day, hour, minute, second);
  const first = guess - offsetMs(new Date(guess), tz);
  // Re-check at the candidate instant so a DST change between guess and result is honored.
  return new Date(guess - offsetMs(new Date(first), tz));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidDate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** `date` moved by `n` calendar days. */
export function addDays(date: LocalDate, n: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** `{ year, month }` moved by `n` months. */
export function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + n;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}
