/**
 * View → date range (BE §2, §5). Pure and client-safe. Weeks start on Monday;
 * the month grid is always 6 weeks (42 days) so it never changes height.
 * Dates are `YYYY-MM-DD` strings in the org time zone, handled as UTC midnights.
 */
import { addDays, mondayOf } from "@/lib/time-tracking/local-time";
import type { CalView } from "@/lib/types/calendario";

/** Days in a month grid (6 weeks). */
export const MONTH_GRID_DAYS = 42;

/** The visible range of `view` around the anchor date `fecha`. */
export function rangeOf(view: CalView, fecha: string): { from: string; to: string } {
  if (view === "dia") return { from: fecha, to: fecha };
  if (view === "semana") {
    const from = mondayOf(fecha);
    return { from, to: addDays(from, 6) };
  }
  const from = mondayOf(`${fecha.slice(0, 7)}-01`);
  return { from, to: addDays(from, MONTH_GRID_DAYS - 1) };
}
