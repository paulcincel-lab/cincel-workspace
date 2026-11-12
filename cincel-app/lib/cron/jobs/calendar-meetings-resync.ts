/**
 * Cron job `calendar-meetings-resync` (Calendario BE §7.3, D13).
 * Every 15 minutes (window `calendar-meetings-resync:<slot>`), creates or
 * patches the Google event of future Cincel meetings whose write failed with
 * `UNAVAILABLE` or `RATE_LIMITED`, up to 3 tries per meeting. The retry never
 * invites attendees a second time (`writeMeetingToGoogle` op `retry`).
 */
import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, inArray, isNull, lt } from "drizzle-orm";

import { acquireLease, releaseLease } from "@/lib/cron/lease";
import { registerJob, type CronJob } from "@/lib/cron/registry";
import { calendarEvents } from "@/lib/db/schema";
import { MEETING_SYNC_MAX_TRIES, writeMeetingToGoogle } from "@/lib/google/calendar-events-sync";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

export const CALENDAR_MEETINGS_RESYNC_EVERY_MS = 15 * 60_000;
const LEASE_SECONDS = 55;
const MAX_PER_TICK = 20;

export function calendarMeetingsResyncDue(now: Date): { run: boolean; windowKey: string } {
  const slot = Math.floor(now.getTime() / CALENDAR_MEETINGS_RESYNC_EVERY_MS);
  return { run: true, windowKey: `calendar-meetings-resync:${slot}` };
}

/** Future confirmed Cincel meetings waiting for a retry, oldest first. */
export async function dueMeetingResyncs(db: OwnerDb, now: Date, limit = MAX_PER_TICK): Promise<string[]> {
  const rows = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.source, "cincel"),
        eq(calendarEvents.status, "confirmada"),
        isNull(calendarEvents.deletedAt),
        gt(calendarEvents.startsAt, now),
        inArray(calendarEvents.googleSyncError, ["UNAVAILABLE", "RATE_LIMITED"]),
        lt(calendarEvents.googleSyncAttempts, MEETING_SYNC_MAX_TRIES),
      ),
    )
    .orderBy(asc(calendarEvents.startsAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

export type CalendarMeetingsResyncDeps = { write?: typeof writeMeetingToGoogle; clock?: () => number };

export async function runCalendarMeetingsResync(
  ctx: Parameters<CronJob["run"]>[0],
  deps: CalendarMeetingsResyncDeps = {},
): Promise<{ count: number }> {
  const owner = randomUUID();
  if (!(await acquireLease(ctx.db, "calendar-meetings-resync", owner, LEASE_SECONDS))) return { count: 0 };
  const write = deps.write ?? writeMeetingToGoogle;
  const clock = deps.clock ?? Date.now;
  const started = clock();
  let count = 0;
  try {
    for (const eventId of await dueMeetingResyncs(ctx.db, ctx.now)) {
      if (clock() - started >= ctx.budgetMs) break;
      try {
        const outcome = await write(eventId, "retry");
        if (outcome.ok) count++;
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "calendar.resync_failed",
            trace_id: ctx.traceId,
            event_id: eventId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  } finally {
    await releaseLease(ctx.db, "calendar-meetings-resync", owner);
  }
  return { count };
}

export const calendarMeetingsResyncJob: CronJob = {
  name: "calendar-meetings-resync",
  due: calendarMeetingsResyncDue,
  run: (ctx) => runCalendarMeetingsResync(ctx),
};

registerJob(calendarMeetingsResyncJob);
