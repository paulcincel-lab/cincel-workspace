/**
 * `notify(db, staffIds, payload)` (redesign BE §8.3, review B10): the one
 * notification producer. Always inserts one row per recipient when any channel
 * is on, with the delivery state on the row (in-app, `email_status`, digest,
 * `deliver_after` after quiet hours); drops the actor and inactive staff;
 * `on conflict (staff_id, dedupe_key) do nothing`. Never sends email inline.
 */
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";
import type { HistoryEntity } from "@/lib/types/core";
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

export async function notify(db: OwnerDb, staffIds: string[], payload: NotifyPayload): Promise<{ created: number }> {
  return notImplemented("notify", db, staffIds, payload);
}
