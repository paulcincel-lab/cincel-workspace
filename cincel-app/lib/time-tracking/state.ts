/**
 * State of today (redesign BE §8.7): no entry → `off`; open entry with an
 * open last pause → `pausa`; open → `on`; entries but none open → `done`.
 * `workedSeconds` = Σ (ended_at ?? now) − started_at − Σ pauses. Pure.
 *
 * `enabled` = settings on and the caller's role not exempt; `required` =
 * enabled, on or after `requiredFrom`, on a work day; `promptAtLogin` =
 * enabled, the org prompt on, state `off`, a work day and before `dayEnd`
 * (all in `America/Mexico_City`).
 */
import type { TimeEntryRow } from "@/lib/repositories/time-entries-repository";
import { dayOfWeek, localDate, localHourMinute } from "@/lib/time-tracking/local-time";
import type { TimeTrackingSettings, TodayStatus } from "@/lib/types/redesign";

type EntryLike = Pick<TimeEntryRow, "startedAt" | "endedAt" | "pauses">;

/** Whether `role` is exempt from time tracking. */
export function isExempt(settings: TimeTrackingSettings, role: string): boolean {
  return settings.exemptRoles.includes(role);
}

/** Whether time tracking applies to `role` (org switch on and not exempt). */
export function trackingEnabled(settings: TimeTrackingSettings, role: string): boolean {
  return settings.enabled && !isExempt(settings, role);
}

/** The status reported when tracking is off for the caller (BE §9.5). */
export function disabledStatus(settings: TimeTrackingSettings): TodayStatus {
  return {
    state: "off",
    startedAt: null,
    workedSeconds: 0,
    required: false,
    promptAtLogin: false,
    enabled: false,
    requiredFrom: settings.requiredFrom,
    hoursPerDay: settings.hoursPerDay,
  };
}

/** Whether the last pause of an entry is still open. */
export function hasOpenPause(entry: Pick<TimeEntryRow, "pauses">): boolean {
  const last = entry.pauses[entry.pauses.length - 1];
  return last !== undefined && last.to === null;
}

/** Seconds worked in one entry up to `now` (its pauses deducted; never negative). */
export function entryWorkedSeconds(entry: EntryLike, now: Date): number {
  const start = entry.startedAt.getTime();
  const end = (entry.endedAt ?? now).getTime();
  let paused = 0;
  for (const pause of entry.pauses) {
    const from = Math.max(new Date(pause.from).getTime(), start);
    const to = Math.min(pause.to === null ? end : new Date(pause.to).getTime(), end);
    if (to > from) paused += to - from;
  }
  return Math.max(0, Math.floor((end - start - paused) / 1000));
}

/** Σ worked seconds of `entries` up to `now`. */
export function workedSeconds(entries: EntryLike[], now: Date): number {
  return entries.reduce((sum, entry) => sum + entryWorkedSeconds(entry, now), 0);
}

/** The state machine position of the given entries. */
export function clockState(entries: EntryLike[]): TodayStatus["state"] {
  const open = entries.find((entry) => entry.endedAt === null);
  if (open) return hasOpenPause(open) ? "pausa" : "on";
  return entries.length > 0 ? "done" : "off";
}

/**
 * The caller's day. `entries` are the caller's entries of today plus the open
 * one when it started on an earlier day (until auto-close runs); `role` is the
 * caller's access role (compared with `exemptRoles`).
 */
export function todayStatus(input: {
  entries: TimeEntryRow[];
  settings: TimeTrackingSettings;
  role: string;
  now: Date;
}): TodayStatus {
  const { entries, settings, role, now } = input;
  if (!trackingEnabled(settings, role)) return disabledStatus(settings);

  const today = localDate(now);
  const workDay = settings.workDays.includes(dayOfWeek(today));
  const state = clockState(entries);
  const first = [...entries].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0];

  return {
    state,
    startedAt: first ? first.startedAt.toISOString() : null,
    workedSeconds: workedSeconds(entries, now),
    required: settings.requiredFrom !== null && today >= settings.requiredFrom && workDay,
    promptAtLogin: settings.promptAtLogin && state === "off" && workDay && localHourMinute(now) < settings.dayEnd,
    enabled: true,
    requiredFrom: settings.requiredFrom,
    hoursPerDay: settings.hoursPerDay,
  };
}
