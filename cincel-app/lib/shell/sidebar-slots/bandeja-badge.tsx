/**
 * Sidebar slot "bandeja-badge" (redesign FE §3.1, §21.1; Phase 5; frame
 * `Sidebar`): loads the caller's `unreadCount` plus the reminders still due
 * today for the Mi espacio nav item badge. The layout loads it on each full
 * render; between renders the unread part follows the Bandeja poll
 * (`useBandejaUnread`) and a reminder leaves the count once its time passes
 * (it then reaches the Bandeja as a notification). Hidden while
 * `fetchNotificationsAction` is a stub.
 */
import { fetchRemindersAction } from "@/lib/actions/my-space-actions";
import { IMPLEMENTED as MY_SPACE_IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { fetchNotificationsAction } from "@/lib/actions/notifications-actions";
import { IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import { addDays, localParts, ORG_TIME_ZONE, zonedTimeToUtc } from "@/lib/my-space/zoned-time";

import { BandejaBadge, type BandejaBadgeData } from "./bandeja-badge-view";
import type { SidebarSlot } from "./index";

/**
 * The caller's unread Bandeja count, or null while the notification read is a
 * stub or fails (the badge then stays hidden; the page still works).
 */
export async function loadBandejaUnread(): Promise<number | null> {
  if (!IMPLEMENTED.fetchNotificationsAction) return null;
  try {
    const page = await fetchNotificationsAction({ unreadOnly: true });
    return Math.max(0, page.unreadCount);
  } catch {
    return null;
  }
}

/** Last instant of the org's local day of `now`. */
export function endOfLocalDay(now: Date): Date {
  const { year, month, day } = localParts(now, ORG_TIME_ZONE);
  const tomorrow = zonedTimeToUtc(addDays({ year, month, day }, 1), 0, 0, ORG_TIME_ZONE);
  return new Date(tomorrow.getTime() - 1);
}

/**
 * `dueAt` of the caller's open reminders (not fired, not cancelled) still due
 * today, from `now` to the end of the local day; empty while the reminders
 * read is a stub or fails (the badge then counts the Bandeja only).
 */
export async function loadDueReminders(now: Date = new Date()): Promise<string[]> {
  if (!MY_SPACE_IMPLEMENTED.fetchRemindersAction) return [];
  try {
    const rows = await fetchRemindersAction({ from: now.toISOString(), to: endOfLocalDay(now).toISOString() });
    return rows.filter((row) => !row.firedAt && !row.cancelledAt).map((row) => row.dueAt);
  } catch {
    return [];
  }
}

/** Data of the slot: unread count, today's pending reminder times and the render instant. */
export async function loadBandejaBadge(now: Date = new Date()): Promise<BandejaBadgeData | null> {
  const [unreadCount, dueReminders] = await Promise.all([loadBandejaUnread(), loadDueReminders(now)]);
  if (unreadCount === null) return null;
  return { unreadCount, dueReminders, renderedAt: now.getTime() };
}

export const bandejaBadgeSlot: SidebarSlot<BandejaBadgeData> = {
  name: "bandeja-badge",
  load: () => loadBandejaBadge(),
  Component: BandejaBadge,
};
