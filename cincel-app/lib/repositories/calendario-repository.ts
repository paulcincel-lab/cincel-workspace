/**
 * Range SQL, day aggregates and load per person/day (Calendario BE §5). Server-only.
 * Reads never load every task: a range returns its items plus per-day aggregates computed in SQL.
 * Reads return safe defaults until the owning issue (Phase 1, Phase 5) replaces the bodies.
 */
import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { emptyCalendarioRange, EMPTY_CALENDARIO_LIST } from "@/lib/calendario/empty";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { stubDefault } from "@/lib/stubs";
import {
  eventDayAggregates,
  eventItemsInRange,
  eventKpis,
  mergeEventDays,
  mergeEventItems,
  mergeEventKpis,
} from "@/lib/repositories/calendario-events-range";
import type {
  CalDay,
  CalItem,
  CalKpis,
  CalendarioListInput,
  CalendarioListPage,
  CalendarioRangeInput,
  DayLoad,
} from "@/lib/types/calendario";

/** One query: a row per day of the range (empty days return zeros). */
export async function dayAggregates(user: AuthenticatedUser, input: CalendarioRangeInput, today: string): Promise<CalDay[]> {
  const days = stubDefault(emptyCalendarioRange(input, today).days, user);
  const events = await eventDayAggregates(user, input, input.filters, eventScope(user));
  return mergeEventDays(days, events, input.filters);
}

function eventScope(user: AuthenticatedUser) {
  return { canViewTeam: resolveCalendarCapabilities(user).canViewTeamCalendar };
}

/** Task and event items of the range, at most `perDayLimit` per day. */
export async function rangeItems(
  user: AuthenticatedUser,
  input: CalendarioRangeInput,
  perDayLimit: number,
): Promise<{ items: CalItem[]; truncated: boolean }> {
  const tasks = stubDefault({ items: [] as CalItem[], truncated: false }, user, input, perDayLimit);
  const events = await eventItemsInRange(user, input, input.filters, eventScope(user), { perDayLimit });
  return mergeEventItems(tasks, events, input.filters);
}

export async function rangeKpis(user: AuthenticatedUser, input: CalendarioRangeInput, today: string): Promise<CalKpis> {
  const kpis = stubDefault(emptyCalendarioRange(input, today).kpis, user);
  return mergeEventKpis(kpis, await eventKpis(user, input, input.filters, eventScope(user)), input.filters);
}

/** Keyset page of items in `(date, kindOrder, start, title, id)` order. */
export async function listItemsPage(user: AuthenticatedUser, input: CalendarioListInput): Promise<CalendarioListPage> {
  return stubDefault(EMPTY_CALENDARIO_LIST, user, input);
}

/** Planned hours per person and day (BE §9). */
export async function dayLoadRows(
  user: AuthenticatedUser,
  input: { from: string; to: string; staffIds?: string[] },
): Promise<DayLoad[]> {
  return stubDefault([] as DayLoad[], user, input);
}
