/**
 * Week-based date helpers, ported 1:1 from the reference Madrid 22
 * dashboard so Gantt/S-curve/board week boundaries match exactly. All
 * inputs/outputs are local-time `Date`s or ISO `YYYY-MM-DD` strings.
 */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mondayOf(d: Date): Date {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - day);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function fmtShort(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function fmtRange(start: Date, end: Date): string {
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} de ${MESES[start.getMonth()]}`;
  }
  return `${fmtShort(start)} – ${fmtShort(end)}`;
}

export interface WeekBounds {
  start: Date;
  end: Date;
}

/** Monday–Sunday bounds of the week `offset` weeks from today's week. */
export function weekBounds(today: Date, offset: number): WeekBounds {
  const base = mondayOf(today);
  const start = addDays(base, offset * 7);
  const end = addDays(start, 6);
  return { start, end };
}

/** ISO date of the Sunday ending today's week — the week-end cutoff used throughout the metrics. */
export function currentWeekEndIso(today: Date): string {
  return isoDate(addDays(mondayOf(today), 6));
}
