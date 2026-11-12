import { infiniteQueryOptions, keepPreviousData, queryOptions, type QueryKey } from "@tanstack/react-query";

import {
  getCalendarioDaySummary,
  getCalendarioList,
  getCalendarioLoad,
  getCalendarioRange,
  getCalendarioWeekSummary,
  getMeetingDetail,
  getMeetingMinutes,
  getMeetingPrep,
  getPlanWeek,
  getProposal,
} from "@/lib/actions/page-data/calendario-actions";
import { fetchCalendarioAssistantHintsAction } from "@/lib/actions/calendario-assistant-actions";
import type { CalendarioAssistantHints } from "@/lib/assistant/calendar-hints";
import { normalizeCalendarioFilters } from "@/lib/calendario/url-state";
import { STALE, qk } from "@/lib/query/keys";
import type {
  CalendarioFilters,
  CalendarioListPage,
  CalendarioRange,
  CalendarioRangeInput,
  CalView,
  DayLoad,
  DaySummary,
  MeetingDetail,
  MeetingMinutes,
  MeetingPrep,
  PlanWeekData,
  Proposal,
  WeekSummary,
} from "@/lib/types/calendario";

/** Meeting detail and prep stay fresh for 30 s (FE §9.2). */
export const MEETING_STALE_MS = 30_000;

type RangeKeyInput = { view: CalView; from: string; to: string; filters: CalendarioFilters };

/** The range of the visible window; the previous data stays while filters change. */
export function calendarioRangeOptions(input: CalendarioRangeInput) {
  const i: RangeKeyInput = { ...input, filters: normalizeCalendarioFilters(input.filters) };
  return queryOptions<CalendarioRange>({
    queryKey: qk.calendario.range(i),
    queryFn: () => getCalendarioRange(i),
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
  });
}

type ListKeyInput = { from: string; to: string; filters: CalendarioFilters; orderDir: "asc" | "desc" };

/** Analítico rows: the cursor is the page param. */
export function calendarioListInfiniteOptions(input: ListKeyInput) {
  const i: ListKeyInput = { ...input, filters: normalizeCalendarioFilters(input.filters) };
  return infiniteQueryOptions<CalendarioListPage, Error, { pages: CalendarioListPage[]; pageParams: (string | null)[] }, readonly unknown[], string | null>({
    queryKey: qk.calendario.list(i),
    queryFn: ({ pageParam }) => getCalendarioList({ ...i, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
  });
}

export function calendarioDaySummaryOptions(date: string) {
  return queryOptions<DaySummary>({
    queryKey: qk.calendario.day(date),
    queryFn: () => getCalendarioDaySummary({ date }),
    staleTime: STALE.screen,
  });
}

export function calendarioWeekSummaryOptions(from: string) {
  return queryOptions<WeekSummary>({
    queryKey: qk.calendario.week(from),
    queryFn: () => getCalendarioWeekSummary({ from }),
    staleTime: STALE.screen,
  });
}

export function calendarioLoadOptions(input: { from: string; to: string; staffIds?: string[] }) {
  const i = { from: input.from, to: input.to, staffIds: [...new Set(input.staffIds ?? [])].sort() };
  return queryOptions<DayLoad[]>({
    queryKey: qk.calendario.load(i),
    queryFn: () => getCalendarioLoad(i.staffIds.length ? i : { from: i.from, to: i.to }),
    staleTime: STALE.screen,
  });
}

export function meetingDetailOptions(id: string) {
  return queryOptions<MeetingDetail | null>({
    queryKey: qk.calendario.meeting(id),
    queryFn: () => getMeetingDetail(id),
    staleTime: MEETING_STALE_MS,
  });
}

export function meetingPrepOptions(id: string) {
  return queryOptions<MeetingPrep | null>({
    queryKey: qk.calendario.prep(id),
    queryFn: () => getMeetingPrep(id),
    staleTime: MEETING_STALE_MS,
  });
}

/** `Infinity` while the notes are being edited (`editing`), so a refetch never overwrites the textarea. */
export function meetingMinutesOptions(id: string, editing = false) {
  return queryOptions<MeetingMinutes | null>({
    queryKey: qk.calendario.minutes(id),
    queryFn: () => getMeetingMinutes(id),
    staleTime: editing ? Infinity : MEETING_STALE_MS,
  });
}

export function planWeekOptions(input: { weekStart: string; staffIds?: string[] }) {
  const i = { weekStart: input.weekStart, staffIds: [...new Set(input.staffIds ?? [])].sort() };
  return queryOptions<PlanWeekData>({
    queryKey: qk.calendario.planWeek(i),
    queryFn: () => getPlanWeek(i.staffIds.length ? i : { weekStart: i.weekStart }),
    staleTime: STALE.screen,
  });
}

/** Seeded with `setQueryData` from the proposing call, so it never refetches by itself. */
export function proposalOptions(id: string) {
  return queryOptions<Proposal | null>({
    queryKey: qk.calendario.proposal(id),
    queryFn: () => getProposal(id),
    staleTime: Infinity,
  });
}

/** What a write makes stale (FE §9.2); `projectId` adds the project history for minutes. */
export type CalendarioInvalidationKind = "tasks" | "meetings" | "minutes";

export function calendarioInvalidations(kind: CalendarioInvalidationKind, projectId?: string): QueryKey[] {
  switch (kind) {
    case "tasks":
      return [qk.calendario.all, qk.tareas.all, qk.inicio(), qk.shell.badges()];
    case "meetings":
      return [qk.calendario.all, qk.inicio()];
    case "minutes":
      return [qk.calendario.all, qk.inicio(), ...(projectId ? [qk.proyectos.history(projectId)] : [])];
  }
}

/** Next delivery, a teammate and a project for the asistente's Calendario suggestions (BE §11.5). */
export function calendarioAssistantHintsOptions() {
  return queryOptions<CalendarioAssistantHints>({
    queryKey: qk.calendario.assistantHints(),
    queryFn: () => fetchCalendarioAssistantHintsAction(),
    staleTime: STALE.screen,
  });
}
