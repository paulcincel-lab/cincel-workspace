/** Notifications and channel preferences (redesign BE §3.5, §7.4). Owner-only. */
import { notificationPreferences, notifications } from "@/lib/db/schema";
import { ownerScoped, type OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationPreferenceDbRow = typeof notificationPreferences.$inferSelect;

export const notificationsRepository = ownerScoped(notifications);

/** The caller's stored preference rows (missing kinds use `NOTIFICATION_DEFAULTS`). */
export async function listNotificationPreferences(db: OwnerDb, staffId: string): Promise<NotificationPreferenceDbRow[]> {
  return notImplemented("listNotificationPreferences", db, staffId);
}
