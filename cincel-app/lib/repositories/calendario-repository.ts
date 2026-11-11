/**
 * Range SQL, day aggregates and load per person/day (Calendario BE §5). Server-only.
 * Reads never load every task: a range returns its items plus per-day aggregates computed in SQL.
 * Reads return safe defaults until the owning issue (Phase 1, Phase 5) replaces the bodies.
 */
import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { emptyCalendarioRange, EMPTY_CALENDARIO_LIST } from "@/lib/calendario/empty";
import { stubDefault } from "@/lib/stubs";
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
  return stubDefault(emptyCalendarioRange(input, today).days, user);
}

/** Task and event items of the range, at most `perDayLimit` per day. */
export async function rangeItems(
  user: AuthenticatedUser,
  input: CalendarioRangeInput,
  perDayLimit: number,
): Promise<{ items: CalItem[]; truncated: boolean }> {
  return stubDefault({ items: [] as CalItem[], truncated: false }, user, input, perDayLimit);
}

export async function rangeKpis(user: AuthenticatedUser, input: CalendarioRangeInput, today: string): Promise<CalKpis> {
  return stubDefault(emptyCalendarioRange(input, today).kpis, user);
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
