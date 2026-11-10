import type { ScheduleStatus } from "@/lib/types/schedule";

export type ScheduleRealDates = { startedOn: string | null; finishedOn: string | null };

/**
 * Real dates of a schedule row after a status change (`started_on` / `finished_on`, the portal's Real and
 * Desvío). Leaving `pending` stamps the start once (the first day it moved keeps winning); reaching `done`
 * stamps the end; going back clears what no longer holds: `pending` clears both, leaving `done` clears the end.
 * `today` is `YYYY-MM-DD` in the schedule time zone.
 */
export function nextScheduleRealDates(
  current: ScheduleRealDates,
  next: ScheduleStatus,
  today: string
): ScheduleRealDates {
  if (next === "pending") return { startedOn: null, finishedOn: null };
  const startedOn = current.startedOn ?? today;
  if (next === "done") return { startedOn, finishedOn: current.finishedOn ?? today };
  return { startedOn, finishedOn: null };
}
