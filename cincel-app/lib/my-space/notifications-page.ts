/**
 * One page of a staff member's Bandeja notifications (redesign BE §7.4),
 * newest first, 30 per page (cursor `<createdAt ISO>_<id>`), plus the unread
 * count. Owner-only: the staff id always comes from the session (the action)
 * or the page's viewer (the Mi espacio loader), never from the input.
 */
import "server-only";

import { db } from "@/lib/db/client";
import {
  countUnreadNotifications,
  listInboxNotifications,
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationCursor,
  type NotificationRow,
} from "@/lib/repositories/notifications-repository";
import type { NotificationItem, NotificationKind, NotificationsPage } from "@/lib/types/redesign";
import { NotificationsQuerySchema, parseInput } from "@/lib/validation/redesign";

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

/** An empty `kinds` list means every kind. Errors: `INVALID`. */
export async function listNotificationsPage(
  staffId: string,
  input: { unreadOnly?: boolean; kinds?: NotificationKind[]; cursor?: string } | undefined,
): Promise<NotificationsPage> {
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
