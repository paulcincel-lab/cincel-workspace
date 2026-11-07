/**
 * `notify(db, staffIds, payload)` (redesign BE §8.3, review B10): the one
 * notification producer. Always inserts one row per recipient when any channel
 * is on, with the delivery state on the row (in-app, `email_status`, digest,
 * `deliver_after` after quiet hours); drops the actor and inactive staff;
 * `on conflict (staff_id, dedupe_key) do nothing`. Never sends email inline.
 */
import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { notificationPreferences, notifications, staff, userPreferences } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import type { HistoryEntity } from "@/lib/types/core";
import { NOTIFICATION_DEFAULTS, type NotificationChannels } from "@/lib/notifications/defaults";
import type { NotificationKind } from "@/lib/types/redesign";

export type NotifyPayload = {
  kind: NotificationKind;
  title: string;
  body?: string;
  entity?: HistoryEntity;
  entityId?: string;
  url?: string;
  dedupeKey?: string;
  /** Never notified of their own action. */
  actorId?: string;
  /** Overrides the recipient's preferences (used by reminders). */
  force?: { inApp?: boolean; email?: boolean };
};

export { NOTIFICATION_DEFAULTS, type NotificationChannels } from "@/lib/notifications/defaults";

/** Quiet hours are wall-clock times in the org time zone (fixed, BE §9.4). */
export const NOTIFY_TIME_ZONE = "America/Mexico_City";

export type NotifyOptions = {
  /** Clock override (cron jobs and tests). */
  now?: Date;
  /** Request id for the `notify.failed` log line; a new uuid otherwise. */
  traceId?: string;
};

/** The channels for one recipient: preference row (or defaults), then `force`. */
export function resolveChannels(
  kind: NotificationKind,
  pref: NotificationChannels | null | undefined,
  force?: NotifyPayload["force"]
): NotificationChannels {
  const base = pref ?? NOTIFICATION_DEFAULTS[kind];
  return {
    inApp: force?.inApp ?? base.inApp,
    email: force?.email ?? base.email,
    digest: base.digest,
  };
}

/** "HH:MM" or "HH:MM:SS" → minutes since midnight; null when malformed. */
function toMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function localParts(at: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset (ms) of `timeZone` from UTC at instant `at`. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const p = localParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant of a local wall-clock date and minute of day in `timeZone`. */
function zonedToUtc(year: number, month: number, day: number, minutes: number, timeZone: string): Date {
  const wall = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  const first = wall - zoneOffsetMs(new Date(wall), timeZone);
  // A second pass settles instants next to an offset change.
  return new Date(wall - zoneOffsetMs(new Date(first), timeZone));
}

/**
 * When `now` falls inside the quiet window `[from, to)` (local time, may cross
 * midnight), the instant the window ends; otherwise null. `from === to` is an
 * empty window.
 */
export function quietHoursEnd(
  now: Date,
  quiet: { from: string; to: string } | null | undefined,
  timeZone: string = NOTIFY_TIME_ZONE
): Date | null {
  if (!quiet) return null;
  const from = toMinutes(quiet.from);
  const to = toMinutes(quiet.to);
  if (from === null || to === null || from === to) return null;

  const local = localParts(now, timeZone);
  const cur = local.hour * 60 + local.minute;
  const crossesMidnight = from > to;
  const inside = crossesMidnight ? cur >= from || cur < to : cur >= from && cur < to;
  if (!inside) return null;

  // The end is today at `to`, unless the window started today and ends tomorrow.
  const endsTomorrow = crossesMidnight && cur >= from;
  const day = new Date(Date.UTC(local.year, local.month - 1, local.day + (endsTomorrow ? 1 : 0)));
  return zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), to, timeZone);
}

export async function notify(
  db: OwnerDb,
  staffIds: string[],
  payload: NotifyPayload,
  opts: NotifyOptions = {}
): Promise<{ created: number }> {
  const recipients = [...new Set(staffIds.filter(Boolean))].filter((id) => id !== payload.actorId);
  if (recipients.length === 0) return { created: 0 };

  try {
    const now = opts.now ?? new Date();

    const active = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(inArray(staff.id, recipients), eq(staff.active, true), isNull(staff.deletedAt)));
    const activeIds = active.map((r) => r.id);
    if (activeIds.length === 0) return { created: 0 };

    const prefRows = await db
      .select({
        staffId: notificationPreferences.staffId,
        inApp: notificationPreferences.inApp,
        email: notificationPreferences.email,
        digest: notificationPreferences.digest,
      })
      .from(notificationPreferences)
      .where(and(inArray(notificationPreferences.staffId, activeIds), eq(notificationPreferences.kind, payload.kind)));
    const quietRows = await db
      .select({ staffId: userPreferences.staffId, from: userPreferences.quietFrom, to: userPreferences.quietTo })
      .from(userPreferences)
      .where(inArray(userPreferences.staffId, activeIds));

    const prefs = new Map(prefRows.map((r) => [r.staffId, r]));
    const quiet = new Map<string, { from: string; to: string }>();
    for (const r of quietRows) if (r.from && r.to) quiet.set(r.staffId, { from: r.from, to: r.to });

    const hasEntity = Boolean(payload.entity && payload.entityId);
    const values: (typeof notifications.$inferInsert)[] = [];
    for (const staffId of activeIds) {
      const ch = resolveChannels(payload.kind, prefs.get(staffId), payload.force);
      if (!ch.inApp && !ch.email && !ch.digest) continue;
      // Quiet hours apply to email only (BE §9.3).
      const deferredTo = ch.email ? quietHoursEnd(now, quiet.get(staffId)) : null;
      values.push({
        staffId,
        kind: payload.kind,
        title: payload.title,
        body: payload.body ?? "",
        entity: hasEntity ? payload.entity : null,
        entityId: hasEntity ? payload.entityId : null,
        url: payload.url ?? null,
        dedupeKey: payload.dedupeKey ?? null,
        inApp: ch.inApp,
        emailStatus: ch.email ? "pending" : "none",
        digest: ch.digest,
        deliverAfter: deferredTo ?? now,
        createdAt: now,
      });
    }
    if (values.length === 0) return { created: 0 };

    // `(staff_id, dedupe_key)` is the table's only unique index besides the id.
    const inserted = await db
      .insert(notifications)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    return { created: inserted.length };
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "notify.failed",
        trace_id: opts.traceId ?? randomUUID(),
        kind: payload.kind,
        count: recipients.length,
        err: err instanceof Error ? err.message : String(err),
      })
    );
    return { created: 0 };
  }
}
