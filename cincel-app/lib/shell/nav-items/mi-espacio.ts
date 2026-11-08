/**
 * Nav item "Mi espacio" (/mi-espacio) of the new shell (redesign FE §3.1, §21.1; Phase 5).
 * `resolve` returns the item with its badge (unread Bandeja items plus the
 * reminders still due today, frame `Sidebar`; absent at zero), or null while
 * it stays hidden: until the page's read actions (notes, checklists,
 * reminders, notifications) are implemented.
 */
import { Inbox } from "lucide-react";

import { IMPLEMENTED as MY_SPACE_IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { IMPLEMENTED as NOTIFICATIONS_IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import { loadBandejaUnread, loadDueReminders } from "@/lib/shell/sidebar-slots/bandeja-badge";
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
    const [unread, dueReminders] = await Promise.all([loadBandejaUnread(), loadDueReminders()]);
    const badge = (unread ?? 0) + dueReminders.length;
    return {
      key: "mi-espacio",
      label: "Mi espacio",
      href: "/mi-espacio",
      icon: Inbox,
      ...(badge > 0 ? { badge } : {}),
    };
  },
};
