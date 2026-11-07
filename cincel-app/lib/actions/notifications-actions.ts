"use server";

import { NOTIFICATION_DEFAULTS } from "@/lib/notifications/defaults";
import { notImplementedAction, stubDefault } from "@/lib/stubs";
import type {
  NotificationKind,
  NotificationPreferences,
  NotificationsPage,
} from "@/lib/types/redesign";

/** Bandeja notifications and channel preferences (redesign BE §7.4). Owner-only. */

/**
 * In-app rows of the caller, newest first, page 30 (cursor `<createdAt ISO>_<id>`).
 * Errors: `INVALID`.
 */
export async function fetchNotificationsAction(input: {
  unreadOnly?: boolean;
  kinds?: NotificationKind[];
  cursor?: string;
}): Promise<NotificationsPage> {
  return stubDefault<NotificationsPage>({ items: [], nextCursor: null, unreadCount: 0 }, input);
}

/** Mark the caller's rows read (others' ids ignored). Errors: `INVALID`. Revalidates `/mi-espacio`. */
export async function markNotificationsReadAction(ids: string[] | "all"): Promise<{ unreadCount: number }> {
  return notImplementedAction("markNotificationsReadAction", ids);
}

/** One row per kind (defaults filled) and the quiet hours. */
export async function fetchNotificationPreferencesAction(): Promise<NotificationPreferences> {
  return stubDefault<NotificationPreferences>({
    rows: Object.entries(NOTIFICATION_DEFAULTS).map(([kind, channels]) => ({
      kind: kind as NotificationKind,
      ...channels,
    })),
    quietHours: null,
  });
}

/** Save the kind × channel matrix and quiet hours. Errors: `INVALID`. Revalidates `/ajustes/notificaciones`. */
export async function updateNotificationPreferencesAction(
  input: NotificationPreferences,
): Promise<NotificationPreferences> {
  return notImplementedAction("updateNotificationPreferencesAction", input);
}
