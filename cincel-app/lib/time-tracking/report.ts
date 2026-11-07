/**
 * Weekly hours report (redesign BE §8.7): hours per day (lunch deducted on
 * days ≥ 5 h without a pause ≥ 30 min), target minus approved vacations,
 * status completo / incompleto / sin_registro, late count. Also the payroll
 * CSV of `/api/horario/export` (BE §7.7): one line per entry, trial days
 * (before `requiredFrom`) left out and counted.
 *
 * `buildTeamHoursRows` and `buildHoursCsvRows` are pure; the two readers
 * load active, non-exempt staff, their entries and approved absences.
 */
import { and, gte, inArray, lte } from "drizzle-orm";

import { timeEntries } from "@/lib/db/schema";
import type { TimeEntryPause } from "@/lib/db/schema/time";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { minutesOf, trackedStaff } from "@/lib/time-tracking/auto-close";
import { addDays, dayOfWeek, localHourMinute, weekDates } from "@/lib/time-tracking/local-time";
import { entryWorkedSeconds } from "@/lib/time-tracking/state";
import { weekTarget } from "@/lib/time-tracking/week-target";
import type { DayHours, TeamHoursRow, TimeEntrySource, TimeTrackingSettings } from "@/lib/types/redesign";
import { buildCsv } from "@/lib/utils/export-service";
import { approvedAbsences } from "@/lib/vacations/approved-absences";

/** Columns of the payroll CSV, in order. */
export const HOURS_CSV_COLUMNS = ["persona", "fecha", "entrada", "salida", "pausas_min", "horas", "origen", "marcada"];

/** A day needs ≥ this many worked hours before lunch is deducted. */
const LUNCH_MIN_HOURS = 5;
/** A pause this long (minutes) already counts as lunch. */
const LUNCH_PAUSE_MIN = 30;

export type ReportPerson = { id: string; name: string; lastName: string | null };

export type ReportEntry = {
  staffId: string;
  workDate: string;
  startedAt: Date;
  endedAt: Date | null;
  pauses: TimeEntryPause[];
  source: TimeEntrySource | "auto_close";
  flagged: boolean;
};

export type ReportAbsence = { staffId: string; from: string; to: string };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fullName(person: ReportPerson): string {
  return [person.name, person.lastName].filter((part) => part && part.trim()).join(" ");
}

/** Seconds of one pause, clipped to the entry's end (open pauses run until `end`). */
function pauseSeconds(pause: TimeEntryPause, end: number): number {
  const from = Date.parse(pause.from);
  const to = pause.to === null ? end : Math.min(Date.parse(pause.to), end);
  return Math.max(0, (to - from) / 1000);
}

type EntryTimes = Pick<ReportEntry, "startedAt" | "endedAt" | "pauses">;

/** Total paused minutes of one entry. */
export function entryPauseMinutes(entry: EntryTimes, now: Date): number {
  const end = (entry.endedAt ?? now).getTime();
  return entry.pauses.reduce((sum, pause) => sum + pauseSeconds(pause, end), 0) / 60;
}

/**
 * Hours of one day: worked hours (2 decimals) minus `lunchMinutes / 60` when
 * the day has ≥ 5 worked hours and no pause of ≥ 30 min.
 */
export function dayHours(entries: EntryTimes[], settings: TimeTrackingSettings, now: Date): number {
  if (entries.length === 0) return 0;
  const worked = entries.reduce((sum, entry) => sum + entryWorkedSeconds(entry, now), 0) / 3600;
  const longPause = entries.some((entry) => {
    const end = (entry.endedAt ?? now).getTime();
    return entry.pauses.some((pause) => pauseSeconds(pause, end) >= LUNCH_PAUSE_MIN * 60);
  });
  const hours = worked >= LUNCH_MIN_HOURS && !longPause ? worked - settings.lunchMinutes / 60 : worked;
  return round2(Math.max(0, hours));
}

/** First clock-in of a work day after `dayStart + lateToleranceMin` → one late count. */
function isLate(entries: ReportEntry[], date: string, settings: TimeTrackingSettings): boolean {
  if (entries.length === 0 || !settings.workDays.includes(dayOfWeek(date))) return false;
  const first = entries.reduce((min, entry) => (entry.startedAt < min.startedAt ? entry : min));
  return minutesOf(localHourMinute(first.startedAt)) > minutesOf(settings.dayStart) + settings.lateToleranceMin;
}

/** The report rows of `people` for the week starting on `weekStart` (Mon–Sun), sorted by name. */
export function buildTeamHoursRows(input: {
  weekStart: string;
  settings: TimeTrackingSettings;
  people: ReportPerson[];
  entries: ReportEntry[];
  absences: ReportAbsence[];
  now: Date;
}): TeamHoursRow[] {
  const { weekStart, settings, people, entries, absences, now } = input;
  const dates = weekDates(weekStart);

  const rows = people.map((person): TeamHoursRow => {
    const own = entries.filter((entry) => entry.staffId === person.id);
    const ofDay = (date: string) => own.filter((entry) => entry.workDate === date);
    const days: DayHours[] = dates.map((date) => ({ date, hours: dayHours(ofDay(date), settings, now) }));
    const total = round2(days.reduce((sum, day) => sum + day.hours, 0));
    const target = weekTarget(
      settings,
      weekStart,
      absences.filter((absence) => absence.staffId === person.id),
    );
    const lateCount = dates.filter((date) => isLate(ofDay(date), date, settings)).length;
    const status: TeamHoursRow["status"] = total === 0 ? "sin_registro" : total >= target ? "completo" : "incompleto";
    return { staffId: person.id, name: fullName(person), days, total, target, lateCount, status };
  });

  return rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** True when `date` is a trial day (before `requiredFrom`, or no `requiredFrom` at all). */
export function isTrialDay(date: string, settings: TimeTrackingSettings): boolean {
  return settings.requiredFrom === null || date < settings.requiredFrom;
}

/**
 * The payroll CSV lines: one per entry, sorted by persona, fecha, entrada;
 * entries of trial days left out and counted (distinct dates).
 * `entrada` / `salida` are local `HH:MM`; `horas` are the entry's worked hours.
 */
export function buildHoursCsvRows(input: {
  settings: TimeTrackingSettings;
  people: ReportPerson[];
  entries: ReportEntry[];
  now: Date;
}): { rows: string[][]; trialDays: number } {
  const { settings, people, entries, now } = input;
  const names = new Map(people.map((person) => [person.id, fullName(person)]));
  const trialDates = new Set<string>();
  const kept: { name: string; entry: ReportEntry }[] = [];

  for (const entry of entries) {
    const name = names.get(entry.staffId);
    if (name === undefined) continue;
    if (isTrialDay(entry.workDate, settings)) {
      trialDates.add(entry.workDate);
      continue;
    }
    kept.push({ name, entry });
  }

  kept.sort(
    (a, b) =>
      a.name.localeCompare(b.name, "es") ||
      a.entry.workDate.localeCompare(b.entry.workDate) ||
      a.entry.startedAt.getTime() - b.entry.startedAt.getTime(),
  );

  const rows = kept.map(({ name, entry }) => [
    name,
    entry.workDate,
    localHourMinute(entry.startedAt),
    entry.endedAt ? localHourMinute(entry.endedAt) : "",
    String(Math.round(entryPauseMinutes(entry, now))),
    round2(entryWorkedSeconds(entry, now) / 3600).toFixed(2),
    entry.source,
    entry.flagged ? "sí" : "no",
  ]);
  return { rows, trialDays: trialDates.size };
}

async function loadWeek(db: OwnerDb, weekStart: string, settings: TimeTrackingSettings) {
  const weekEnd = addDays(weekStart, 6);
  const people = await trackedStaff(db, settings);
  const ids = people.map((person) => person.id);
  const entries: ReportEntry[] =
    ids.length === 0
      ? []
      : await db
          .select({
            staffId: timeEntries.staffId,
            workDate: timeEntries.workDate,
            startedAt: timeEntries.startedAt,
            endedAt: timeEntries.endedAt,
            pauses: timeEntries.pauses,
            source: timeEntries.source,
            flagged: timeEntries.flagged,
          })
          .from(timeEntries)
          .where(
            and(
              inArray(timeEntries.staffId, ids),
              gte(timeEntries.workDate, weekStart),
              lte(timeEntries.workDate, weekEnd),
            ),
          );
  return { people, ids, weekEnd, entries };
}

/** Report of every active, non-exempt staff member for the week starting `weekStart` (a Monday). */
export async function teamHoursReport(
  db: OwnerDb,
  weekStart: string,
  settings: TimeTrackingSettings,
  now: Date = new Date(),
): Promise<TeamHoursRow[]> {
  const { people, ids, weekEnd, entries } = await loadWeek(db, weekStart, settings);
  if (ids.length === 0) return [];
  const absences = await approvedAbsences(db, { from: weekStart, to: weekEnd, staffIds: ids });
  return buildTeamHoursRows({ weekStart, settings, people, entries, absences, now });
}

/** The CSV body (BOM included) of the week starting `weekStart`, plus the count of excluded trial days. */
export async function teamHoursCsv(
  db: OwnerDb,
  weekStart: string,
  settings: TimeTrackingSettings,
  now: Date = new Date(),
): Promise<{ csv: string; trialDays: number }> {
  const { people, entries } = await loadWeek(db, weekStart, settings);
  const { rows, trialDays } = buildHoursCsvRows({ settings, people, entries, now });
  return { csv: buildCsv(HOURS_CSV_COLUMNS, rows), trialDays };
}
