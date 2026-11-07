"use server";

import { revalidatePath } from "next/cache";

import { canManageTimeTracking, canViewTeamHours } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { clockIn, clockOut, listDayEntries, pauseWork, resumeWork } from "@/lib/time-tracking/clock";
import { localDate, mondayOf, weekDates } from "@/lib/time-tracking/local-time";
import { teamHoursReport } from "@/lib/time-tracking/report";
import {
  getTimeTrackingSettings,
  validateTimeTrackingSettings,
  writeTimeTrackingSettings,
} from "@/lib/time-tracking/settings";
import { todayStatus, trackingEnabled } from "@/lib/time-tracking/state";
import { weekHours } from "@/lib/time-tracking/week-hours";
import { weekTarget } from "@/lib/time-tracking/week-target";
import type {
  TeamHoursRow,
  TimeEntrySource,
  TimeTrackingSettings,
  TodayStatus,
  WeekHours,
} from "@/lib/types/redesign";
import { approvedAbsences } from "@/lib/vacations/approved-absences";
import { parseInput, TeamHoursInputSchema } from "@/lib/validation/redesign";

/**
 * Control de horario (redesign BE §7.7, §8.7, §9.5). Settings live in
 * `app_settings('time_tracking')`; the clock state machine and its
 * transactions in `lib/time-tracking/{state,clock}.ts`. Every clock action
 * works on the session's own entries only (the staff id never comes from
 * input). Errors are `Error("CODE: detail")` for `actionErrorText`.
 */

type Caller = { staffId: string; role: string };

const SOURCES: readonly TimeEntrySource[] = ["sidebar", "login", "assistant"];

async function requireCaller(): Promise<Caller> {
  const user = await requireCapabilityUser();
  return { staffId: user.member.id, role: user.access };
}

async function statusOf(caller: Caller, settings: TimeTrackingSettings, now: Date): Promise<TodayStatus> {
  if (!trackingEnabled(settings, caller.role)) return todayStatus({ entries: [], settings, role: caller.role, now });
  const entries = await listDayEntries(db, caller.staffId, localDate(now));
  return todayStatus({ entries, settings, role: caller.role, now });
}

/** Settings and caller of a clock write; `DISABLED` when tracking is off or the caller is exempt. */
async function requireTracking(): Promise<{ caller: Caller; settings: TimeTrackingSettings }> {
  const caller = await requireCaller();
  const settings = await getTimeTrackingSettings();
  if (!trackingEnabled(settings, caller.role)) throw new Error("DISABLED: time tracking");
  return { caller, settings };
}

/** Org settings (seeded disabled). Auth: staff. */
export async function fetchTimeTrackingSettingsAction(): Promise<TimeTrackingSettings> {
  await requireCapabilityUser();
  return getTimeTrackingSettings();
}

/**
 * Auth: `canManageTimeTracking`. Errors: `FORBIDDEN`, `INVALID` (dayEnd ≤
 * dayStart; hoursPerDay ∉ 1–12; workDays empty or ∉ 0–6; unknown exempt role;
 * a changed `requiredFrom` earlier than tomorrow). Revalidates `/` (layout), `/ajustes/horario`.
 */
export async function saveTimeTrackingSettingsAction(input: TimeTrackingSettings): Promise<TimeTrackingSettings> {
  const user = await requireCapabilityUser();
  if (!canManageTimeTracking(user)) throw new Error("FORBIDDEN: time tracking settings");
  const previous = await getTimeTrackingSettings();
  const settings = validateTimeTrackingSettings(input, previous, new Date());
  await writeTimeTrackingSettings(settings);
  revalidatePath("/", "layout");
  revalidatePath("/ajustes/horario");
  return settings;
}

/** The caller's day (incl. `requiredFrom`, `hoursPerDay`). Auth: staff. */
export async function fetchMyTodayAction(): Promise<TodayStatus> {
  const caller = await requireCaller();
  const settings = await getTimeTrackingSettings();
  return statusOf(caller, settings, new Date());
}

/** off | done → on. Errors: `DISABLED` (off or exempt), `ALREADY_ON`. */
export async function clockInAction(input: { source: TimeEntrySource }): Promise<TodayStatus> {
  const source = input?.source;
  if (!SOURCES.includes(source)) throw new Error("INVALID: source");
  const { caller, settings } = await requireTracking();
  await clockIn(db, caller.staffId, source, new Date());
  return statusOf(caller, settings, new Date());
}

/** on → pausa. Errors: `NOT_ON`. */
export async function pauseWorkAction(): Promise<TodayStatus> {
  const { caller, settings } = await requireTracking();
  await pauseWork(db, caller.staffId, new Date());
  return statusOf(caller, settings, new Date());
}

/** pausa → on. Errors: `NOT_ON`. */
export async function resumeWorkAction(): Promise<TodayStatus> {
  const { caller, settings } = await requireTracking();
  await resumeWork(db, caller.staffId, new Date());
  return statusOf(caller, settings, new Date());
}

/** on | pausa → done (closes an open pause first). Errors: `NOT_ON`. */
export async function clockOutAction(): Promise<TodayStatus> {
  const { caller, settings } = await requireTracking();
  await clockOut(db, caller.staffId, new Date());
  return statusOf(caller, settings, new Date());
}

/** Active, non-exempt staff for the week starting `weekStart` (a Monday). Auth: `canViewTeamHours`. Errors: `FORBIDDEN`, `INVALID`. */
export async function fetchTeamHoursAction(input: { weekStart: string }): Promise<TeamHoursRow[]> {
  const user = await requireCapabilityUser();
  if (!canViewTeamHours(user)) throw new Error("FORBIDDEN: team hours");
  const { weekStart } = parseInput(TeamHoursInputSchema, input);
  return teamHoursReport(db, weekStart, await getTimeTrackingSettings());
}

/**
 * The caller's current week, Mon–Sun (used by Perfil), with the report rules
 * of BE §8.7: hours per day after the lunch rule, and a target of
 * `hoursPerDay` per work day minus the days of approved vacations. Auth: staff.
 */
export async function fetchMyWeekHoursAction(): Promise<WeekHours> {
  const caller = await requireCaller();
  const settings = await getTimeTrackingSettings();
  const monday = mondayOf(localDate(new Date()));
  const dates = weekDates(monday);
  const [hours, absences] = await Promise.all([
    weekHours(db, [caller.staffId], monday, settings),
    approvedAbsences(db, { from: dates[0], to: dates[6], staffIds: [caller.staffId] }),
  ]);
  const mine = hours.get(caller.staffId);
  const byDate = new Map((mine?.days ?? []).map((day) => [day.date, day.hours]));
  const days = dates.map((date) => ({ date, hours: byDate.get(date) ?? 0 }));
  const total = Math.round(days.reduce((sum, day) => sum + day.hours, 0) * 100) / 100;
  const target = weekTarget(
    settings,
    monday,
    absences.filter((absence) => absence.staffId === caller.staffId),
  );
  return { days, total, target };
}
