"use server";

import { toActionResult } from "@/lib/actions/action-result";
import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listNotificationsPage } from "@/lib/my-space/notifications-page";
import { loadNotificationPreferences } from "@/lib/notifications/preferences-server";
import {
  countUnreadNotifications,
  markNotificationsRead,
  saveQuietHours,
  summarizeNotifications,
  upsertNotificationPreferences,
} from "@/lib/repositories/notifications-repository";
import type {
  NotificationKind,
  NotificationKindSummary,
  NotificationPreferences,
  NotificationsPage,
} from "@/lib/types/redesign";
import type { ActionResult } from "@/lib/types/schedule";
import {
  MarkNotificationsReadSchema,
  NotificationPreferencesSchema,
  parseInput,
} from "@/lib/validation/redesign";

/**
 * Bandeja notifications and channel preferences (redesign BE §7.4). Owner-only.
 * Mi espacio reads them through TanStack Query (`me.notifications`); mark-read
 * patches that cache and `shell.badges` from its result, so nothing here
 * revalidates `/mi-espacio`.
 */

/** The owner is always the session staff, never an input. */
async function sessionStaffId(): Promise<string> {
  const user = await requireCapabilityUser();
  return user.member.id;
}

/**
 * In-app rows of the caller, newest first, page 30 (cursor `<createdAt ISO>_<id>`).
 * An empty `kinds` list means every kind. Errors: `INVALID`. Read-only.
 */
export async function fetchNotificationsAction(input: {
  unreadOnly?: boolean;
  kinds?: NotificationKind[];
  cursor?: string;
}): Promise<NotificationsPage> {
  return listNotificationsPage(await sessionStaffId(), input);
}

/** Unread and total in-app rows of the caller per kind, with the newest date (Mi espacio Analítico). Read-only. */
export async function fetchNotificationsSummaryAction(): Promise<NotificationKindSummary[]> {
  return summarizeNotifications(db, await sessionStaffId());
}

/**
 * Mark the caller's rows read (others' ids ignored) and return the new unread
 * count, which the client writes into `me.notifications` and `shell.badges`.
 * Errors (as `{ ok: false }`): `INVALID`.
 */
export async function markNotificationsReadAction(
  ...args: Parameters<typeof markNotificationsReadActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof markNotificationsReadActionImpl>>>> {
  return toActionResult(() => markNotificationsReadActionImpl(...args));
}

async function markNotificationsReadActionImpl(ids: string[] | "all"): Promise<{ unreadCount: number }> {
  const staffId = await sessionStaffId();
  const target = parseInput(MarkNotificationsReadSchema, ids);
  await markNotificationsRead(db, staffId, target === "all" ? "all" : [...new Set(target)]);
  const unreadCount = await countUnreadNotifications(db, staffId);
  return { unreadCount };
}

/** One row per kind (defaults filled) and the quiet hours. */
export async function fetchNotificationPreferencesAction(): Promise<NotificationPreferences> {
  const staffId = await sessionStaffId();
  return loadNotificationPreferences(staffId);
}

/**
 * Save the kind × channel matrix and quiet hours. Kinds left out keep their
 * stored value (or default). Errors (`{ ok: false }`): `INVALID` (unknown or
 * repeated kind, malformed or empty quiet hours). No revalidation: Ajustes ›
 * Notificaciones writes the result into `qk.ajustes.page('notificaciones')`.
 */
export async function updateNotificationPreferencesAction(
  ...args: Parameters<typeof updateNotificationPreferencesActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateNotificationPreferencesActionImpl>>>> {
  return toActionResult(() => updateNotificationPreferencesActionImpl(...args));
}

async function updateNotificationPreferencesActionImpl(
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
  return loadNotificationPreferences(staffId);
}
