/** The calendar month of Mejoras' "Resueltas este mes", in America/Mexico_City time. */
export const MEJORAS_TIME_ZONE = "America/Mexico_City";

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: MEJORAS_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** The wall clock of `date` in Mexico City, read back as if it were UTC. */
function wallClockAsUtc(date: Date): number {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
}

/** The instant at which the Mexico City wall clock reads the first of `year`-`month` (0-based) at 00:00. */
function startOfMonth(year: number, month: number): Date {
  const wall = Date.UTC(year, month, 1);
  let instant = wall;
  // Two passes settle the offset even when it changes near the boundary.
  for (let i = 0; i < 2; i++) instant = wall - (wallClockAsUtc(new Date(instant)) - instant);
  return new Date(instant);
}

/** `[start, end)` of the Mexico City calendar month that contains `now`. */
export function mexicoMonthRange(now: Date = new Date()): { start: Date; end: Date } {
  const local = new Date(wallClockAsUtc(now));
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return { start: startOfMonth(year, month), end: startOfMonth(year, month + 1) };
}
