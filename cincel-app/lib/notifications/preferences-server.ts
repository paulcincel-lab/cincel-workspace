import "server-only";

import { db } from "@/lib/db/client";
import { NOTIFICATION_DEFAULTS } from "@/lib/notifications/defaults";
import { findQuietHours, listNotificationPreferences } from "@/lib/repositories/notifications-repository";
import type { NotificationKind, NotificationPreferences } from "@/lib/types/redesign";

const NOTIFICATION_KINDS = Object.keys(NOTIFICATION_DEFAULTS) as NotificationKind[];

/**
 * One staff member's notification preferences: one row per kind (stored
 * value, else the default) and the quiet hours. Read-only. Callers pass the
 * session staff id only (`notifications-actions.ts`, the Ajustes ›
 * Notificaciones loader).
 */
export async function loadNotificationPreferences(staffId: string): Promise<NotificationPreferences> {
  const [stored, quietHours] = await Promise.all([
    listNotificationPreferences(db, staffId),
    findQuietHours(db, staffId),
  ]);
  const byKind = new Map(stored.map((row) => [row.kind, row]));
  return {
    rows: NOTIFICATION_KINDS.map((kind) => {
      const row = byKind.get(kind);
      const channels = row
        ? { inApp: row.inApp, email: row.email, digest: row.digest }
        : NOTIFICATION_DEFAULTS[kind];
      return { kind, inApp: channels.inApp, email: channels.email, digest: channels.digest };
    }),
    quietHours,
  };
}
