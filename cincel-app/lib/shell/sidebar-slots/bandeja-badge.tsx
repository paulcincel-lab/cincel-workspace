/**
 * Sidebar slot "bandeja-badge" (redesign FE §3.1, §21.1; Phase 5): loads the
 * caller's `unreadCount` for the Mi espacio nav item badge. The layout loads
 * it on each full render; between renders the badge follows the Bandeja poll
 * (`useBandejaUnread`). Hidden while `fetchNotificationsAction` is a stub.
 */
import { fetchNotificationsAction } from "@/lib/actions/notifications-actions";
import { IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";

import { BandejaBadge } from "./bandeja-badge-view";
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

export const bandejaBadgeSlot: SidebarSlot<{ unreadCount: number }> = {
  name: "bandeja-badge",
  load: async () => {
    const unreadCount = await loadBandejaUnread();
    return unreadCount === null ? null : { unreadCount };
  },
  Component: BandejaBadge,
};
