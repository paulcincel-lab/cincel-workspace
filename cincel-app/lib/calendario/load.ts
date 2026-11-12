/** Load and capacity (BE §9). Pure and client-safe. Bodies belong to the Phase 5 issue. */
import type { LoadLabel } from "@/lib/types/calendario";

export const DEFAULT_TASK_HOURS = 1;
export const DEFAULT_WORKDAY_HOURS = 6;
export const LOAD_LABEL_COPY: Record<LoadLabel, string> = {
  libre: "Libre",
  bien: "Bien",
  casi_lleno: "Casi lleno",
  sobrecargado: "Sobrecargado",
};

/** Task value, else the template default, else 1 h. */
export function effectiveHours(t: { estimatedHours: number | null; templateHours: number | null }): {
  hours: number;
  source: "task" | "template" | "default";
} {
  if (t.estimatedHours !== null && t.estimatedHours > 0) return { hours: t.estimatedHours, source: "task" };
  if (t.templateHours !== null && t.templateHours > 0) return { hours: t.templateHours, source: "template" };
  return { hours: DEFAULT_TASK_HOURS, source: "default" };
}

/** weekly / workDays, rounded to 0.5; else the org default. */
export function workdayHours(p: { weeklyCapacityHours: number | null; workDays: number }, orgDefault: number): number {
  const weekly = p.weeklyCapacityHours;
  if (weekly === null || !Number.isFinite(weekly) || weekly <= 0 || p.workDays <= 0) return orgDefault;
  return Math.round((weekly / p.workDays) * 2) / 2;
}

/** < 50 % libre, <= 85 % bien, <= 100 % casi lleno, > 100 % sobrecargado. */
export function loadLabel(hours: number, workday: number): LoadLabel {
  if (workday <= 0) return hours > 0 ? "sobrecargado" : "libre";
  // Scaled to whole hundredths so the thresholds are exact (no float drift at 85 % or 100 %).
  const pct = Math.round((hours / workday) * 1e6) / 1e4;
  if (pct < 50) return "libre";
  if (pct <= 85) return "bien";
  if (pct <= 100) return "casi_lleno";
  return "sobrecargado";
}

/** Pairs of event ids whose time ranges overlap (touching ends do not). Earlier start first in each pair. */
export function overlaps(events: { id: string; start: string; end: string }[]): [string, string][] {
  const items = events
    .map((e) => ({ id: e.id, start: Date.parse(e.start), end: Date.parse(e.end) }))
    .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end) && e.end > e.start)
    .sort((a, b) => a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pairs: [string, string][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length && items[j]!.start < items[i]!.end; j++) {
      pairs.push([items[i]!.id, items[j]!.id]);
    }
  }
  return pairs;
}

function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The instant of `date` (YYYY-MM-DD) at `time` (HH:MM) in `timeZone`. */
function zonedInstant(date: string, time: string, timeZone: string): number {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  const [h = 0, mi = 0] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  return guess - zoneOffsetMs(guess, timeZone);
}

function addDay(date: string): string {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Hours of a meeting that fall inside the jornada (`dayStart`-`dayEnd`, local time) on each date of
 * `[from, to]`. A meeting outside the jornada counts 0; one crossing midnight is split by day.
 */
export function meetingHoursByDay(
  meeting: { start: string; end: string },
  range: { from: string; to: string; dayStart: string; dayEnd: string; timeZone: string },
): Record<string, number> {
  const start = Date.parse(meeting.start);
  const end = Date.parse(meeting.end);
  const out: Record<string, number> = {};
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return out;
  for (let date = range.from; date <= range.to; date = addDay(date)) {
    const winStart = zonedInstant(date, range.dayStart, range.timeZone);
    const winEnd = zonedInstant(date, range.dayEnd, range.timeZone);
    const ms = Math.min(end, winEnd) - Math.max(start, winStart);
    if (ms > 0) out[date] = Math.round((ms / 3_600_000) * 100) / 100;
  }
  return out;
}

/** Adds the viewer's own load (`quien = yo`) to the days of a range: hours, workday, label and number of overlapping pairs. */
export function applyLoadToDays<D extends { date: string; hours: number | null; workday: number | null; loadLabel: LoadLabel | null; overlaps: number }>(
  days: D[],
  load: { date: string; hours: number; workday: number; label: LoadLabel; overlaps: [string, string][] }[],
): D[] {
  const byDate = new Map(load.map((l) => [l.date, l]));
  return days.map((d) => {
    const l = byDate.get(d.date);
    return l ? { ...d, hours: l.hours, workday: l.workday, loadLabel: l.label, overlaps: l.overlaps.length } : d;
  });
}
