/**
 * Phase 1 read helper (redesign BE §8.12): worked hours per staff and day of
 * one week (§8.7 rules, lunch deduction). Zeros until entries exist.
 *
 * A day's hours = Σ over its entries of `(ended_at ?? now) − started_at − Σ
 * pauses`, in hours with 2 decimals, minus `lunchMinutes / 60` when the day
 * has ≥ 5 worked hours and no pause ≥ 30 min. The week is the 7 local days
 * starting at `weekStart` (Monday); every requested staff gets all 7 days.
 */
import { and, gte, inArray, lte } from "drizzle-orm";

import { timeEntries } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import type { DayHours, TimeTrackingSettings } from "@/lib/types/redesign";

/** Worked hours from which the lunch deduction applies (BE §8.7). */
export const LUNCH_THRESHOLD_HOURS = 5;
/** A pause at least this long counts as the lunch break already taken (BE §8.7). */
export const LUNCH_PAUSE_MINUTES = 30;

export type WeekHoursEntry = {
  staffId: string;
  workDate: string;
  startedAt: Date;
  endedAt: Date | null;
  pauses: { from: string; to: string | null }[];
};

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The 7 local dates of the week starting at `weekStart`. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Hours of one local day from its entries (BE §8.7 day and lunch rules). */
export function dayHours(entries: WeekHoursEntry[], lunchMinutes: number, now: Date): number {
  if (entries.length === 0) return 0;
  let workedMs = 0;
  let longestPauseMs = 0;
  for (const entry of entries) {
    const end = (entry.endedAt ?? now).getTime();
    let pausedMs = 0;
    for (const pause of entry.pauses ?? []) {
      const from = new Date(pause.from).getTime();
      const to = pause.to ? new Date(pause.to).getTime() : end;
      const length = Math.max(0, Math.min(to, end) - from);
      pausedMs += length;
      if (length > longestPauseMs) longestPauseMs = length;
    }
    workedMs += Math.max(0, end - entry.startedAt.getTime() - pausedMs);
  }
  const worked = workedMs / 3_600_000;
  const lunchTaken = longestPauseMs >= LUNCH_PAUSE_MINUTES * 60_000;
  const deduction = worked >= LUNCH_THRESHOLD_HOURS && !lunchTaken ? Math.max(0, lunchMinutes) / 60 : 0;
  return Math.max(0, round2(worked - deduction));
}

/** Pure grouping of entries into the `weekHours` result. */
export function computeWeekHours(
  entries: WeekHoursEntry[],
  staffIds: string[],
  weekStart: string,
  settings: Pick<TimeTrackingSettings, "lunchMinutes">,
  now: Date,
): Map<string, { days: DayHours[]; total: number }> {
  const dates = weekDates(weekStart);
  const byStaffDay = new Map<string, WeekHoursEntry[]>();
  for (const entry of entries) {
    const key = `${entry.staffId}|${entry.workDate}`;
    const list = byStaffDay.get(key);
    if (list) list.push(entry);
    else byStaffDay.set(key, [entry]);
  }
  const result = new Map<string, { days: DayHours[]; total: number }>();
  for (const staffId of staffIds) {
    if (result.has(staffId)) continue;
    const days = dates.map((date) => ({
      date,
      hours: dayHours(byStaffDay.get(`${staffId}|${date}`) ?? [], settings.lunchMinutes, now),
    }));
    result.set(staffId, { days, total: round2(days.reduce((sum, d) => sum + d.hours, 0)) });
  }
  return result;
}

export async function weekHours(
  db: OwnerDb,
  staffIds: string[],
  weekStart: string,
  settings: TimeTrackingSettings,
): Promise<Map<string, { days: DayHours[]; total: number }>> {
  const now = new Date();
  const ids = [...new Set(staffIds)];
  if (ids.length === 0) return new Map();
  const weekEnd = addDays(weekStart, 6);
  const rows = await db
    .select({
      staffId: timeEntries.staffId,
      workDate: timeEntries.workDate,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      pauses: timeEntries.pauses,
    })
    .from(timeEntries)
    .where(
      and(inArray(timeEntries.staffId, ids), gte(timeEntries.workDate, weekStart), lte(timeEntries.workDate, weekEnd)),
    );
  return computeWeekHours(rows, ids, weekStart, settings, now);
}
