import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import {
  EMPTY_CALENDARIO_LIST,
  emptyCalendarioRange,
  emptyDaySummary,
  emptyMinutes,
  emptyPlanWeek,
  emptyWeekSummary,
} from "@/lib/calendario/empty";
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
  return stubDefault(null, user, id);
}
