/**
 * Cron job `daily-digest` (redesign BE §9.3, §13, owned by Phase 1).
 * From 07:30 local, once per day (window `daily-digest:<YYYY-MM-DD>`), in order:
 * (1) the daily producers (`lib/cron/daily-producers`), (2) the digests,
 * (3) housekeeping: purge read / non-inbox notifications older than 180 days,
 * soft-delete assistant threads beyond 50 per staff, trim `gmail_threads`
 * beyond 500 per staff.
 */
import { and, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";

import { runDailyProducers } from "@/lib/cron/daily-producers";
import { registerJob, type CronJob } from "@/lib/cron/registry";
import { localIsoDate } from "@/lib/dashboard/task-trend";
import { assistantThreads, gmailThreads, notifications } from "@/lib/db/schema";
import { sendDailyDigests } from "@/lib/notifications/digest";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

/** Local time the digest window opens (minutes since midnight, 07:30). */
export const DAILY_DIGEST_AT_MINUTES = 7 * 60 + 30;

/** Notifications older than this many days are purged once read or when not in the Bandeja. */
export const NOTIFICATION_RETENTION_DAYS = 180;

/** Live assistant threads kept per staff. */
export const ASSISTANT_THREADS_KEPT = 50;

/** Cached Gmail threads kept per staff. */
export const GMAIL_THREADS_KEPT = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

function localMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

/** Due from 07:30 local until midnight, so a missed 07:30 tick still runs the day's window once. */
export function dailyDigestDue(now: Date, tz: string): { run: boolean; windowKey?: string } {
  if (localMinutes(now, tz) < DAILY_DIGEST_AT_MINUTES) return { run: false };
  return { run: true, windowKey: `daily-digest:${localIsoDate(now, tz)}` };
}

/** Deletes notifications older than 180 days that were read or never listed in the Bandeja. */
export async function purgeOldNotifications(db: OwnerDb, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * DAY_MS);
  const rows = await db
    .delete(notifications)
    .where(
      and(
        lt(notifications.createdAt, cutoff),
        or(isNotNull(notifications.readAt), eq(notifications.inApp, false)),
        ne(notifications.emailStatus, "pending")
      )
    )
    .returning({ id: notifications.id });
  return rows.length;
}

/** Soft-deletes each staff's live assistant threads beyond the 50 most recently updated. */
export async function trimAssistantThreads(db: OwnerDb, now: Date): Promise<number> {
  const ranked = db
    .select({
      id: assistantThreads.id,
      rn: sql<number>`row_number() over (partition by ${assistantThreads.staffId} order by ${assistantThreads.updatedAt} desc, ${assistantThreads.id} desc)`.as(
        "rn"
      ),
    })
    .from(assistantThreads)
    .where(isNull(assistantThreads.deletedAt))
    .as("ranked");
  const rows = await db
    .update(assistantThreads)
    .set({ deletedAt: now })
    .where(
      and(
        isNull(assistantThreads.deletedAt),
        inArray(assistantThreads.id, db.select({ id: ranked.id }).from(ranked).where(gt(ranked.rn, ASSISTANT_THREADS_KEPT)))
      )
    )
    .returning({ id: assistantThreads.id });
  return rows.length;
}

/** Deletes each staff's cached Gmail threads beyond the 500 most recently received. */
export async function trimGmailThreads(db: OwnerDb): Promise<number> {
  const rows = await db
    .delete(gmailThreads)
    .where(
      sql`(${gmailThreads.staffId}, ${gmailThreads.id}) in (
        select ranked.staff_id, ranked.id from (
          select g.staff_id, g.id,
            row_number() over (partition by g.staff_id order by g.received_at desc, g.id desc) as rn
          from ${gmailThreads} g
        ) ranked
        where ranked.rn > ${GMAIL_THREADS_KEPT}
      )`
    )
    .returning({ id: gmailThreads.id });
  return rows.length;
}

export const dailyDigestJob: CronJob = {
  name: "daily-digest",
  due: dailyDigestDue,
  run: async (ctx) => {
    await runDailyProducers(ctx);
    const digests = await sendDailyDigests(ctx.db, ctx.now);
    await purgeOldNotifications(ctx.db, ctx.now);
    await trimAssistantThreads(ctx.db, ctx.now);
    await trimGmailThreads(ctx.db);
    return { count: digests.count };
  },
};

registerJob(dailyDigestJob);
