/** Notifications and channel preferences (redesign BE §3.5, §7.4). Owner-only. */
import { and, count, desc, eq, inArray, isNull, max, sql, type SQL } from "drizzle-orm";

import { notificationPreferences, notifications, userPreferences } from "@/lib/db/schema";
import { ownerScoped, type OwnerDb } from "@/lib/repositories/owner-scoped";
import type { NotificationKind, NotificationKindSummary } from "@/lib/types/redesign";

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationPreferenceDbRow = typeof notificationPreferences.$inferSelect;

export const notificationsRepository = ownerScoped(notifications);

/** Bandeja page size (BE §7.4). */
export const NOTIFICATIONS_PAGE_SIZE = 30;

/** Position after which the next page starts: the last row of the previous page. */
export type NotificationCursor = { createdAt: Date; id: string };

/**
 * `created_at` truncated to the millisecond: the cursor carries a JS ISO
 * string, so ordering and comparison use the same precision and no row is
 * skipped or repeated between pages.
 */
const createdAtMs = sql`date_trunc('milliseconds', ${notifications.createdAt})`;

/** The caller's in-app rows, newest first (`in_app = true` only). */
export async function listInboxNotifications(
  db: OwnerDb,
  staffId: string,
  opts: { unreadOnly?: boolean; kinds?: NotificationKind[]; cursor?: NotificationCursor | null; limit?: number } = {},
): Promise<NotificationRow[]> {
  const where: SQL[] = [eq(notifications.staffId, staffId), eq(notifications.inApp, true)];
  if (opts.unreadOnly) where.push(isNull(notifications.readAt));
  if (opts.kinds && opts.kinds.length > 0) where.push(inArray(notifications.kind, opts.kinds));
  if (opts.cursor) {
    where.push(
      sql`(${createdAtMs}, ${notifications.id}) < (${opts.cursor.createdAt.toISOString()}::timestamptz, ${opts.cursor.id}::uuid)`,
    );
  }
  return db
    .select()
    .from(notifications)
    .where(and(...where))
    .orderBy(desc(createdAtMs), desc(notifications.id))
    .limit(opts.limit ?? NOTIFICATIONS_PAGE_SIZE);
}

/** Unread in-app rows of the caller. */
export async function countUnreadNotifications(db: OwnerDb, staffId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.staffId, staffId), eq(notifications.inApp, true), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

/**
 * Unread and total in-app rows of the caller per kind, with the newest
 * `created_at` (same filter as `listInboxNotifications`). Kinds without rows
 * are left out.
 */
export async function summarizeNotifications(db: OwnerDb, staffId: string): Promise<NotificationKindSummary[]> {
  const rows = await db
    .select({
      kind: notifications.kind,
      total: count(),
      unread: count(sql`case when ${notifications.readAt} is null then 1 end`),
      latestAt: max(notifications.createdAt),
    })
    .from(notifications)
    .where(and(eq(notifications.staffId, staffId), eq(notifications.inApp, true)))
    .groupBy(notifications.kind);
  return rows.map((row) => ({
    kind: row.kind,
    unread: Number(row.unread),
    total: Number(row.total),
    latestAt: row.latestAt ? new Date(row.latestAt).toISOString() : null,
  }));
}

/**
 * Sets `read_at = now` on the caller's unread in-app rows: every one for
 * `"all"`, else only the given ids that belong to the caller (others ignored).
 * Returns how many rows changed.
 */
export async function markNotificationsRead(db: OwnerDb, staffId: string, ids: string[] | "all"): Promise<number> {
  if (ids !== "all" && ids.length === 0) return 0;
  const where: SQL[] = [eq(notifications.staffId, staffId), eq(notifications.inApp, true), isNull(notifications.readAt)];
  if (ids !== "all") where.push(inArray(notifications.id, ids));
  const changed = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(...where))
    .returning({ id: notifications.id });
  return changed.length;
}

/** The caller's stored preference rows (missing kinds use `NOTIFICATION_DEFAULTS`). */
export async function listNotificationPreferences(db: OwnerDb, staffId: string): Promise<NotificationPreferenceDbRow[]> {
  return db.select().from(notificationPreferences).where(eq(notificationPreferences.staffId, staffId));
}

/** Upserts one row per given kind for the caller. */
export async function upsertNotificationPreferences(
  db: OwnerDb,
  staffId: string,
  rows: { kind: NotificationKind; inApp: boolean; email: boolean; digest: boolean }[],
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(notificationPreferences)
    .values(rows.map((row) => ({ staffId, kind: row.kind, inApp: row.inApp, email: row.email, digest: row.digest })))
    .onConflictDoUpdate({
      target: [notificationPreferences.staffId, notificationPreferences.kind],
      set: {
        inApp: sql`excluded.in_app`,
        email: sql`excluded.email`,
        digest: sql`excluded.digest`,
        updatedAt: new Date(),
      },
    });
}

/** "HH:MM:SS" (Postgres `time`) → "HH:MM". */
function toHourMinute(value: string): string {
  return value.slice(0, 5);
}

/** The caller's quiet hours (stored on `user_preferences`), or null. */
export async function findQuietHours(db: OwnerDb, staffId: string): Promise<{ from: string; to: string } | null> {
  const [row] = await db
    .select({ from: userPreferences.quietFrom, to: userPreferences.quietTo })
    .from(userPreferences)
    .where(eq(userPreferences.staffId, staffId))
    .limit(1);
  if (!row || row.from == null || row.to == null) return null;
  return { from: toHourMinute(row.from), to: toHourMinute(row.to) };
}

/** Writes only the quiet-hour columns of the caller's `user_preferences` row (created with defaults when missing). */
export async function saveQuietHours(
  db: OwnerDb,
  staffId: string,
  quietHours: { from: string; to: string } | null,
): Promise<void> {
  const quietFrom = quietHours?.from ?? null;
  const quietTo = quietHours?.to ?? null;
  await db
    .insert(userPreferences)
    .values({ staffId, quietFrom, quietTo })
    .onConflictDoUpdate({
      target: userPreferences.staffId,
      set: { quietFrom, quietTo, updatedAt: new Date() },
    });
}
