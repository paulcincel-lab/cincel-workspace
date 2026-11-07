/**
 * Nav item "Mi espacio" (/mi-espacio) of the new shell (redesign FE §3.1, §21.1; Phase 5).
 * `resolve` returns the item with its unread badge (`unreadCount`, absent at
 * zero), or null while it stays hidden: until the page's read actions
 * (notes, checklists, reminders, notifications) are implemented.
 */
import { Inbox } from "lucide-react";

import { IMPLEMENTED as MY_SPACE_IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { IMPLEMENTED as NOTIFICATIONS_IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import { loadBandejaUnread } from "@/lib/shell/sidebar-slots/bandeja-badge";
import type { NavItemSource } from "@/lib/ui/nav";

/** True when every read the /mi-espacio page needs is implemented. */
export function miEspacioAvailable(): boolean {
  return (
    MY_SPACE_IMPLEMENTED.fetchNotesAction &&
    MY_SPACE_IMPLEMENTED.fetchChecklistsAction &&
    MY_SPACE_IMPLEMENTED.fetchRemindersAction &&
    NOTIFICATIONS_IMPLEMENTED.fetchNotificationsAction
  );
}

export const miEspacioNavItem: NavItemSource = {
  key: "mi-espacio",
  section: "items",
  order: 20,
  resolve: async () => {
    if (!miEspacioAvailable()) return null;
    const unread = await loadBandejaUnread();
    return {
      key: "mi-espacio",
      label: "Mi espacio",
      href: "/mi-espacio",
      icon: Inbox,
      ...(unread ? { badge: unread } : {}),
    };
  },
};
