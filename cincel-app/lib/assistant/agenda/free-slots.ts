/**
 * Free-slot search for the `find_free_slots` assistant tool (redesign BE
 * §10.3, §11.1): the jornada `dayStart–dayEnd` of each work day, minus days
 * when any person has an approved absence, minus busy intervals, intersected
 * for every person. Pure: callers pass settings, absences and busy times.
 */
import { zonedIsoDate, zonedIsoMinute } from "@/lib/dates/zoned-formatters";

export type BusyInterval = { start: string; end: string };

export type FreeSlotsInput = {
  /** Local dates (`YYYY-MM-DD`) in `timeZone`, inclusive. */
  from: string;
  to: string;
  durationMin: number;
  /** Only `dayStart–dayEnd` of `workDays`; otherwise the whole day, every day. */
  workingHoursOnly: boolean;
  settings: { dayStart: string; dayEnd: string; workDays: number[] };
  timeZone: string;
  staffIds: string[];
  /** Approved absences, local dates inclusive. */
  absences: { staffId: string; from: string; to: string }[];
  busy: BusyInterval[];
  /** Slots never start before this instant. */
  now?: Date;
  /** Most free windows returned. */
  limit?: number;
};

export type FreeSlot = { date: string; start: string; end: string; minutes: number };

export type FreeSlotsResult = {
  slots: FreeSlot[];
  /** Local dates skipped because someone has an approved absence. */
  absentDays: { date: string; staffIds: string[] }[];
  truncated: boolean;
};

/** Longest range searched, in days. */
export const MAX_RANGE_DAYS = 31;
const DEFAULT_LIMIT = 20;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string): { y: number; m: number; d: number } {
  if (!DATE_RE.test(value)) throw new Error("INVALID");
  const [y, m, d] = value.split("-").map(Number);
  return { y, m, d };
}

/** `YYYY-MM-DD` plus `days`. */
export function addDaysToDate(value: string, days: number): string {
  const { y, m, d } = parseDate(value);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Day of week of a calendar date, 0 = domingo … 6 = sábado. */
export function weekdayOf(value: string): number {
  const { y, m, d } = parseDate(value);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** `HH:MM` → minutes after midnight ("24:00" → 1440). */
export function minutesOf(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("INVALID");
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes < 0 || minutes > 1440) throw new Error("INVALID");
  return minutes;
}

/**
 * Offset of `timeZone` from UTC at `instant`, in ms (local − UTC). Reads the
 * cached minute formatter (`lib/dates/zoned-formatters.ts`); zone offsets are
 * whole minutes, so minute precision is exact.
 */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const local = zonedIsoMinute(new Date(instant), timeZone);
  const [date, time] = local.split("T");
  const { y, m, d } = parseDate(date);
  const [hour, minute] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hour, minute);
  return asUtc - Math.floor(instant / 60_000) * 60_000;
}

/** The UTC instant of local `date` + `minutes` after midnight in `timeZone`. */
export function zonedTimeToUtc(date: string, minutes: number, timeZone: string): Date {
  const { y, m, d } = parseDate(date);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = guess - zoneOffsetMs(guess, timeZone);
  // A second pass settles instants next to a DST change.
  const second = guess - zoneOffsetMs(first, timeZone);
  return new Date(second);
}

/** Local `YYYY-MM-DD` of an instant in `timeZone`. */
export function localDateOf(instant: Date, timeZone: string): string {
  return zonedIsoDate(instant, timeZone);
}

/** Local `HH:MM` of an instant in `timeZone`. */
export function localTimeOf(instant: Date, timeZone: string): string {
  return zonedIsoMinute(instant, timeZone).slice(11);
}

/** Every local date of `[from, to]`; throws INVALID when to < from or the range is too long. */
export function eachDate(from: string, to: string, maxDays = MAX_RANGE_DAYS): string[] {
  parseDate(from);
  parseDate(to);
  if (to < from) throw new Error("INVALID");
  const days: string[] = [];
  for (let day = from; day <= to; day = addDaysToDate(day, 1)) {
    days.push(day);
    if (days.length > maxDays) throw new Error("INVALID");
  }
  return days;
}

type Interval = { start: number; end: number };

function subtract(windows: Interval[], busy: Interval[]): Interval[] {
  let result = windows;
  for (const b of busy) {
    const next: Interval[] = [];
    for (const w of result) {
      if (b.end <= w.start || b.start >= w.end) {
        next.push(w);
        continue;
      }
      if (b.start > w.start) next.push({ start: w.start, end: b.start });
      if (b.end < w.end) next.push({ start: b.end, end: w.end });
    }
    result = next;
  }
  return result;
}

export function findFreeSlots(input: FreeSlotsInput): FreeSlotsResult {
  const durationMs = input.durationMin * 60_000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("INVALID");
  const limit = input.limit ?? DEFAULT_LIMIT;
  const days = eachDate(input.from, input.to);
  const workDays = new Set(input.settings.workDays);
  const dayStart = input.workingHoursOnly ? minutesOf(input.settings.dayStart) : 0;
  const dayEnd = input.workingHoursOnly ? minutesOf(input.settings.dayEnd) : 1440;
  if (dayEnd <= dayStart) throw new Error("INVALID");
  const wanted = new Set(input.staffIds);
  const now = input.now?.getTime() ?? Number.NEGATIVE_INFINITY;

  const busy: Interval[] = input.busy
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const slots: FreeSlot[] = [];
  const absentDays: FreeSlotsResult["absentDays"] = [];
  let truncated = false;

  for (const date of days) {
    if (input.workingHoursOnly && !workDays.has(weekdayOf(date))) continue;
    const absent = [
      ...new Set(
        input.absences
          .filter((a) => wanted.has(a.staffId) && a.from <= date && a.to >= date)
          .map((a) => a.staffId),
      ),
    ];
    if (absent.length > 0) {
      absentDays.push({ date, staffIds: absent });
      continue;
    }
    const start = Math.max(zonedTimeToUtc(date, dayStart, input.timeZone).getTime(), now);
    const end = zonedTimeToUtc(date, dayEnd, input.timeZone).getTime();
    if (end <= start) continue;
    for (const free of subtract([{ start, end }], busy)) {
      if (free.end - free.start < durationMs) continue;
      if (slots.length >= limit) {
        truncated = true;
        break;
      }
      const s = new Date(free.start);
      const e = new Date(free.end);
      slots.push({ date, start: s.toISOString(), end: e.toISOString(), minutes: Math.round((free.end - free.start) / 60_000) });
    }
    if (truncated) break;
  }

  return { slots, absentDays, truncated };
}
