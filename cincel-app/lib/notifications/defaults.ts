/**
 * Default notification channels per kind (redesign BE §8.3). A plain module
 * with no database imports, so client-safe readers and the preferences action
 * can use it without loading the schema.
 */
import type { NotificationKind } from "@/lib/types/redesign";

export type NotificationChannels = { inApp: boolean; email: boolean; digest: boolean };

/** Channels when a recipient has no preference row for a kind (BE §8.3). */
export const NOTIFICATION_DEFAULTS: Record<NotificationKind, NotificationChannels> = {
  asignacion: { inApp: true, email: true, digest: false },
  mencion: { inApp: true, email: true, digest: false },
  vencimiento: { inApp: true, email: false, digest: true },
  comentario: { inApp: true, email: false, digest: true },
  aprobacion_cliente: { inApp: true, email: false, digest: false },
  recordatorio: { inApp: true, email: true, digest: false },
  sistema: { inApp: true, email: false, digest: false },
};
