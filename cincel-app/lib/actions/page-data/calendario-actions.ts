"use server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import {
  loadCalendarioList,
  loadCalendarioRange,
  loadDayLoad,
  loadDaySummary,
  loadMeetingDetail,
  loadMeetingMinutes,
  loadMeetingPrep,
  loadPlanWeek,
  loadProposal,
  loadWeekSummary,
} from "@/lib/loaders/calendario";
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
import {
  CalendarioListInputSchema,
  CalendarioRangeInputSchema,
  DateInputSchema,
  LoadInputSchema,
  PlanWeekInputSchema,
  WeekInputSchema,
} from "@/lib/validation/calendario";
import { UuidSchema, parseInput } from "@/lib/validation/project-flow";

/**
 * Calendario reads for TanStack Query (FE §9.2, BE §12). Each parses its input,
 * requires a staff session with `canViewCalendar` (FORBIDDEN otherwise) and hands
 * the viewer to the loader. Read-only; the loaders are stubs that return safe defaults.
 */
async function calendarUser() {
  const user = await requireCapabilityUser();
  if (!resolveCalendarCapabilities(user).canViewCalendar) throw new Error("FORBIDDEN");
  return user;
}

export async function getCalendarioRange(input: CalendarioRangeInput): Promise<CalendarioRange> {
  const parsed = parseInput(CalendarioRangeInputSchema, input);
  return loadCalendarioRange(await calendarUser(), parsed);
}

export async function getCalendarioList(input: CalendarioListInput): Promise<CalendarioListPage> {
  const parsed = parseInput(CalendarioListInputSchema, input);
  return loadCalendarioList(await calendarUser(), parsed);
}

export async function getCalendarioDaySummary(input: { date: string }): Promise<DaySummary> {
  const parsed = parseInput(DateInputSchema, input);
  return loadDaySummary(await calendarUser(), parsed);
}

export async function getCalendarioWeekSummary(input: { from: string }): Promise<WeekSummary> {
  const parsed = parseInput(WeekInputSchema, input);
  return loadWeekSummary(await calendarUser(), parsed);
}

export async function getCalendarioLoad(input: { from: string; to: string; staffIds?: string[] }): Promise<DayLoad[]> {
  const parsed = parseInput(LoadInputSchema, input);
  return loadDayLoad(await calendarUser(), parsed);
}

export async function getMeetingDetail(eventId: string): Promise<MeetingDetail | null> {
  const id = parseInput(UuidSchema, eventId);
  return loadMeetingDetail(await calendarUser(), id);
}

export async function getMeetingPrep(eventId: string): Promise<MeetingPrep | null> {
  const id = parseInput(UuidSchema, eventId);
  return loadMeetingPrep(await calendarUser(), id);
}

export async function getMeetingMinutes(eventId: string): Promise<MeetingMinutes | null> {
  const id = parseInput(UuidSchema, eventId);
  return loadMeetingMinutes(await calendarUser(), id);
}

export async function getPlanWeek(input: { weekStart: string; staffIds?: string[] }): Promise<PlanWeekData> {
  const parsed = parseInput(PlanWeekInputSchema, input);
  return loadPlanWeek(await calendarUser(), parsed);
}

/** Null for a proposal of another person. */
export async function getProposal(id: string): Promise<Proposal | null> {
  const parsed = parseInput(UuidSchema, id);
  return loadProposal(await calendarUser(), parsed);
}
