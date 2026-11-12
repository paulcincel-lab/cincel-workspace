import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { PER_DAY_LIMIT } from "@/lib/calendario/items";
import {
  emptyDaySummary,
  emptyMinutes,
  emptyPlanWeek,
  emptyWeekSummary,
} from "@/lib/calendario/empty";
import { todayInAppTimeZone } from "@/lib/project-flow/admin-tasks";
import * as calendarEventsRepository from "@/lib/repositories/calendar-events-repository";
import * as calendarioRepository from "@/lib/repositories/calendario-repository";
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

function requireCalendar(user: AuthenticatedUser): void {
  if (!resolveCalendarCapabilities(user).canViewCalendar) throw new Error("FORBIDDEN");
}

/**
 * Items of the visible range plus per-day aggregates computed in SQL: three reads
 * (day aggregates, items with their support people, KPIs), never the full task list.
 * `quien = todos` is forced to `yo` without `canViewTeamCalendar` (inside the repository).
 * Meetings, hours and the Google state join in their own issues: `events` counts 0 and
 * `hours` / `workday` / `loadLabel` are null until then.
 */
export async function loadCalendarioRange(user: AuthenticatedUser, input: CalendarioRangeInput): Promise<CalendarioRange> {
  requireCalendar(user);
  const today = todayInAppTimeZone();
  const perDayLimit = PER_DAY_LIMIT[input.view];
  const [days, found, kpis] = await Promise.all([
    calendarioRepository.dayAggregates(user, input, today),
    calendarioRepository.rangeItems(user, input, perDayLimit, today),
    calendarioRepository.rangeKpis(user, input, today),
  ]);
  const shown = new Map<string, number>();
  for (const item of found.items) shown.set(item.date, (shown.get(item.date) ?? 0) + 1);
  return {
    from: input.from,
    to: input.to,
    today,
    days: days.map((d) => ({ ...d, shown: shown.get(d.date) ?? 0 })),
    items: found.items,
    kpis,
    truncated: found.truncated,
    google: { connected: false, eventsGrant: false, syncedAt: null, error: null },
  };
}

/** Keyset page of the Analítico list. */
export async function loadCalendarioList(user: AuthenticatedUser, input: CalendarioListInput): Promise<CalendarioListPage> {
  requireCalendar(user);
  return calendarioRepository.listItemsPage(user, input);
}

export async function loadDaySummary(user: AuthenticatedUser, input: { date: string }): Promise<DaySummary> {
  return stubDefault(emptyDaySummary(input.date), user);
}

export async function loadWeekSummary(user: AuthenticatedUser, input: { from: string }): Promise<WeekSummary> {
  return stubDefault(emptyWeekSummary(input.from), user);
}

export async function loadDayLoad(user: AuthenticatedUser, input: { from: string; to: string; staffIds?: string[] }): Promise<DayLoad[]> {
  return stubDefault([] as DayLoad[], user, input);
}

export async function loadMeetingDetail(user: AuthenticatedUser, eventId: string): Promise<MeetingDetail | null> {
  requireCalendar(user);
  return calendarEventsRepository.getMeetingDetail(user, eventId);
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
  return stubDefault(null, user, id);
}
