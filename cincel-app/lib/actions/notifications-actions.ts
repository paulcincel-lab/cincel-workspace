"use server";

import { revalidateAjustesScreen } from "@/lib/cache/screens/ajustes";
import { revalidateMiEspacioScreen } from "@/lib/cache/screens/mi-espacio";

import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { NOTIFICATION_DEFAULTS } from "@/lib/notifications/defaults";
import {
  countUnreadNotifications,
  findQuietHours,
  listInboxNotifications,
  listNotificationPreferences,
  markNotificationsRead,
  NOTIFICATIONS_PAGE_SIZE,
  saveQuietHours,
  upsertNotificationPreferences,
  type NotificationCursor,
  type NotificationRow,
} from "@/lib/repositories/notifications-repository";
import type {
  NotificationItem,
  NotificationKind,
  NotificationPreferences,
  NotificationsPage,
} from "@/lib/types/redesign";
import {
  MarkNotificationsReadSchema,
  NotificationPreferencesSchema,
  NotificationsQuerySchema,
  parseInput,
} from "@/lib/validation/redesign";

/** Bandeja notifications and channel preferences (redesign BE §7.4). Owner-only. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/** `<createdAt ISO>_<id>` → cursor; anything else → `INVALID: cursor`. */
function parseCursor(raw: string | undefined): NotificationCursor | null {
  if (raw === undefined || raw === "") return null;
  const at = raw.lastIndexOf("_");
  const iso = at > 0 ? raw.slice(0, at) : "";
  const id = at > 0 ? raw.slice(at + 1) : "";
  const createdAt = new Date(iso);
  if (!ISO_RE.test(iso) || Number.isNaN(createdAt.getTime()) || !UUID_RE.test(id)) {
    throw new Error("INVALID: cursor");
  }
  return { createdAt, id };
}

function toItem(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    entity: row.entity ?? null,
    entityId: row.entityId ?? null,
    url: row.url ?? null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The owner is always the session staff, never an input. */
async function sessionStaffId(): Promise<string> {
  const user = await requireCapabilityUser();
  return user.member.id;
}

const NOTIFICATION_KINDS = Object.keys(NOTIFICATION_DEFAULTS) as NotificationKind[];

async function loadPreferences(staffId: string): Promise<NotificationPreferences> {
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

/**
 * In-app rows of the caller, newest first, page 30 (cursor `<createdAt ISO>_<id>`).
 * An empty `kinds` list means every kind. Errors: `INVALID`.
 */
export async function fetchNotificationsAction(input: {
  unreadOnly?: boolean;
  kinds?: NotificationKind[];
  cursor?: string;
}): Promise<NotificationsPage> {
  const staffId = await sessionStaffId();
  const query = parseInput(NotificationsQuerySchema, input ?? {});
  const cursor = parseCursor(query.cursor);
  const [rows, unreadCount] = await Promise.all([
    listInboxNotifications(db, staffId, {
      unreadOnly: query.unreadOnly,
      kinds: query.kinds,
      cursor,
      limit: NOTIFICATIONS_PAGE_SIZE + 1,
    }),
    countUnreadNotifications(db, staffId),
  ]);
  const page = rows.slice(0, NOTIFICATIONS_PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > NOTIFICATIONS_PAGE_SIZE && last ? `${last.createdAt.toISOString()}_${last.id}` : null;
  return { items: page.map(toItem), nextCursor, unreadCount };
}

/** Mark the caller's rows read (others' ids ignored). Errors: `INVALID`. Revalidates `/mi-espacio`. */
export async function markNotificationsReadAction(ids: string[] | "all"): Promise<{ unreadCount: number }> {
  const staffId = await sessionStaffId();
  const target = parseInput(MarkNotificationsReadSchema, ids);
  await markNotificationsRead(db, staffId, target === "all" ? "all" : [...new Set(target)]);
  const unreadCount = await countUnreadNotifications(db, staffId);
  revalidateMiEspacioScreen(["miEspacio"]);
  return { unreadCount };
}

/** One row per kind (defaults filled) and the quiet hours. */
export async function fetchNotificationPreferencesAction(): Promise<NotificationPreferences> {
  const staffId = await sessionStaffId();
  return loadPreferences(staffId);
}

/**
 * Save the kind × channel matrix and quiet hours. Kinds left out keep their
 * stored value (or default). Errors: `INVALID` (unknown or repeated kind,
 * malformed or empty quiet hours). Revalidates `/ajustes/notificaciones`.
 */
export async function updateNotificationPreferencesAction(
  input: NotificationPreferences,
): Promise<NotificationPreferences> {
  const staffId = await sessionStaffId();
  const parsed = parseInput(NotificationPreferencesSchema, input);
  const kinds = new Set(parsed.rows.map((row) => row.kind));
  if (kinds.size !== parsed.rows.length) throw new Error("INVALID: rows");
  if (parsed.quietHours && parsed.quietHours.from === parsed.quietHours.to) throw new Error("INVALID: quietHours");
  await db.transaction(async (tx) => {
    await upsertNotificationPreferences(tx, staffId, parsed.rows);
    await saveQuietHours(tx, staffId, parsed.quietHours);
  });
  revalidateAjustesScreen("notificaciones");
  return loadPreferences(staffId);
}
