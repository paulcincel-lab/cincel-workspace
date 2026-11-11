/**
 * Notification preference helpers for Ajustes › Notificaciones (redesign FE §3.8).
 */
import { NOTIFICATION_DEFAULTS } from "@/lib/notifications/notify";
import type { NotificationKind, NotificationPreferences } from "@/lib/types/redesign";

/** Matrix row order (FE §3.8). */
export const NOTIFICATION_KIND_ORDER: readonly NotificationKind[] = [
  "asignacion",
  "mencion",
  "vencimiento",
  "comentario",
  "aprobacion_cliente",
  "recordatorio",
  "sistema",
  "reunion",
];

/** One row per kind in matrix order; kinds without a stored row get `NOTIFICATION_DEFAULTS`. */
export function withNotificationDefaults(prefs: NotificationPreferences): NotificationPreferences {
  const byKind = new Map(prefs.rows.map((row) => [row.kind, row]));
  return {
    rows: NOTIFICATION_KIND_ORDER.map((kind) => {
      const row = byKind.get(kind);
      return row
        ? { kind, inApp: row.inApp, email: row.email, digest: row.digest }
        : { kind, ...NOTIFICATION_DEFAULTS[kind] };
    }),
    quietHours: prefs.quietHours,
  };
}
