/**
 * Estimated hours of a task (#1084): the range the field accepts, how it is
 * shown ("2 h") and read from text. Pure and client-safe; the editors are the
 * task sheet's field, the Horas cell and the bulk bar's picker.
 */

export const HOURS_MIN = 0.5;
export const HOURS_MAX = 80;
export const HOURS_STEP = 0.5;
/** What the calendar counts for a task without hours and without a template (BE §3.5). */
export const HOURS_FALLBACK = 1;

const NUMBER = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });

/** "2 h", "1.5 h"; "—" without hours. */
export function formatHours(hours: number | null | undefined): string {
  return hours === null || hours === undefined ? "—" : `${NUMBER.format(hours)} h`;
}

/** The text of the field for a stored value ("" when none). */
export function hoursFieldText(hours: number | null | undefined): string {
  return hours === null || hours === undefined ? "" : String(hours);
}

export type HoursInput = { ok: true; hours: number | null } | { ok: false };

/** Reads the field's text: empty clears (null), a number within 0.5–80 saves (two decimals), anything else is invalid. */
export function parseHoursText(text: string): HoursInput {
  const clean = text.trim().replace(",", ".");
  if (!clean) return { ok: true, hours: null };
  const value = Number(clean);
  if (!Number.isFinite(value) || value < HOURS_MIN || value > HOURS_MAX) return { ok: false };
  return { ok: true, hours: Math.round(value * 100) / 100 };
}

/** The value a cell or bulk editor holds → hours (null = none). */
export function hoursOfCellValue(value: string | null | string[]): number | null {
  if (typeof value !== "string" || value === "") return null;
  const parsed = parseHoursText(value);
  return parsed.ok ? parsed.hours : null;
}
