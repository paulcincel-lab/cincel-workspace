import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import {
  EMPTY_CALENDARIO_LIST,
  emptyCalendarioRange,
  emptyMinutes,
  emptyPlanWeek,
} from "@/lib/calendario/empty";
import { buildDaySummary, buildWeekSummary } from "@/lib/calendario/risk";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { todayInAppTimeZone } from "@/lib/project-flow/admin-tasks";
import { cachedDateTimeFormat } from "@/lib/dates/zoned-formatters";
import { INICIO_TIME_ZONE } from "@/lib/inicio/header";
import { loadSummaryData } from "@/lib/repositories/calendario-summary-repository";
import { addDays, mondayOf } from "@/lib/time-tracking/local-time";
import { getProposal } from "@/lib/repositories/proposals-repository";
import { stubDefault } from "@/lib/stubs";
import type {
  CalendarioListInput,
  CalendarioListPage,
  CalendarioRange,
  CalendarioRangeInput,
  DayLoad,
  DaySummary,
  MeetingDetail,
  MeetingMinutes,
  MeetingPrep,
  PlanWeekData,
  Proposal,
  WeekSummary,
} from "@/lib/types/calendario";

/**
 * Calendario loaders (BE §5, §8, §9, §10). One read per visible range; Google is
 * read from the Postgres cache, never live. Stubs return safe defaults and never
 * throw; the owning issues replace the bodies.
 */

/** Items of the visible range plus per-day aggregates computed in SQL. */
export async function loadCalendarioRange(user: AuthenticatedUser, input: CalendarioRangeInput): Promise<CalendarioRange> {
  return stubDefault(emptyCalendarioRange(input), user);
}

/** Keyset page of the Analítico list. */
export async function loadCalendarioList(user: AuthenticatedUser, input: CalendarioListInput): Promise<CalendarioListPage> {
  return stubDefault(EMPTY_CALENDARIO_LIST, user, input);
}

function assertCanViewCalendar(user: AuthenticatedUser): void {
  if (!resolveCalendarCapabilities(user).canViewCalendar) throw new Error("FORBIDDEN");
}

/** Hour of the day (0-23) in the organization time zone. */
function orgHour(now: Date): number {
  return Number.parseInt(cachedDateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: INICIO_TIME_ZONE }).format(now), 10) % 24;
}

/** Greeting, lead and the four tiles for one day (BE §10.1); the lead is a template, no model. */
export async function loadDaySummary(user: AuthenticatedUser, input: { date: string }, now: Date = new Date()): Promise<DaySummary> {
  assertCanViewCalendar(user);
  const today = todayInAppTimeZone(now);
  const data = await loadSummaryData(user, { from: input.date, to: input.date, today });
  return buildDaySummary({
    viewerId: user.member.id,
    viewerName: user.member.name,
    today,
    from: input.date,
    to: input.date,
    hour: orgHour(now),
    ...data,
    overloaded: [],
  });
}

export async function loadWeekSummary(user: AuthenticatedUser, input: { from: string }, now: Date = new Date()): Promise<WeekSummary> {
  assertCanViewCalendar(user);
  const today = todayInAppTimeZone(now);
  const from = mondayOf(input.from);
  const to = addDays(from, 6);
  const [data, load] = await Promise.all([
    loadSummaryData(user, { from, to, today }),
    loadDayLoad(user, { from, to, staffIds: [user.member.id] }),
  ]);
  const overloaded = load
    .filter((d) => d.staffId === user.member.id && d.label === "sobrecargado")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, hours: d.hours, workday: d.workday }));
  return buildWeekSummary({
    viewerId: user.member.id,
    viewerName: user.member.name,
    today,
    from,
    to,
    hour: orgHour(now),
    ...data,
    overloaded,
  });
}

export async function loadDayLoad(user: AuthenticatedUser, input: { from: string; to: string; staffIds?: string[] }): Promise<DayLoad[]> {
  return stubDefault([] as DayLoad[], user, input);
}

export async function loadMeetingDetail(user: AuthenticatedUser, eventId: string): Promise<MeetingDetail | null> {
  return stubDefault(null, user, eventId);
}

export async function loadMeetingPrep(user: AuthenticatedUser, eventId: string): Promise<MeetingPrep | null> {
  return stubDefault(null, user, eventId);
}

export async function loadMeetingMinutes(user: AuthenticatedUser, eventId: string): Promise<MeetingMinutes | null> {
  return stubDefault(emptyMinutes(eventId), user);
}

export async function loadPlanWeek(user: AuthenticatedUser, input: { weekStart: string; staffIds?: string[] }): Promise<PlanWeekData> {
  return stubDefault(emptyPlanWeek(input.weekStart), user);
}

export async function loadProposal(user: AuthenticatedUser, id: string): Promise<Proposal | null> {
  return getProposal(user, id);
}
