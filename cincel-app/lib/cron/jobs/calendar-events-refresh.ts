/**
 * Cron job `calendar-events-refresh` (Calendario BE §7.2).
 * Every 30 minutes (window `calendar-events-refresh:<slot>`), refreshes the
 * primary-calendar cache of every staff member with the `calendar_events`
 * grant. The refresh itself skips a cache that is still fresh. Each person
 * runs on their own: a failure is logged and the tick moves on.
 */
import { randomUUID } from "node:crypto";

import { acquireLease, releaseLease } from "@/lib/cron/lease";
import { registerJob, type CronJob } from "@/lib/cron/registry";
import { refreshPrimaryEvents } from "@/lib/google/calendar-events-sync";
import { listStaffWithEventsGrant } from "@/lib/repositories/google-calendar-sync-repository";

export const CALENDAR_EVENTS_REFRESH_EVERY_MS = 30 * 60_000;
const LEASE_SECONDS = 55;

/** One run per 30-minute slot of the day. */
export function calendarEventsRefreshDue(now: Date): { run: boolean; windowKey: string } {
  const slot = Math.floor(now.getTime() / CALENDAR_EVENTS_REFRESH_EVERY_MS);
  return { run: true, windowKey: `calendar-events-refresh:${slot}` };
}

export type CalendarEventsRefreshDeps = {
  staffIds?: () => Promise<string[]>;
  refresh?: typeof refreshPrimaryEvents;
  clock?: () => number;
};

export async function runCalendarEventsRefresh(
  ctx: Parameters<CronJob["run"]>[0],
  deps: CalendarEventsRefreshDeps = {},
): Promise<{ count: number }> {
  const owner = randomUUID();
  if (!(await acquireLease(ctx.db, "calendar-events-refresh", owner, LEASE_SECONDS))) return { count: 0 };
  const refresh = deps.refresh ?? refreshPrimaryEvents;
  const clock = deps.clock ?? Date.now;
  const started = clock();
  let count = 0;
  try {
    for (const staffId of await (deps.staffIds ?? listStaffWithEventsGrant)()) {
      if (clock() - started >= ctx.budgetMs) break;
      try {
        await refresh(staffId, { now: ctx.now });
        count++;
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "calendar.refresh_failed",
            trace_id: ctx.traceId,
            staff_id: staffId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  } finally {
    await releaseLease(ctx.db, "calendar-events-refresh", owner);
  }
  return { count };
}

export const calendarEventsRefreshJob: CronJob = {
  name: "calendar-events-refresh",
  due: calendarEventsRefreshDue,
  run: (ctx) => runCalendarEventsRefresh(ctx),
};

registerJob(calendarEventsRefreshJob);
