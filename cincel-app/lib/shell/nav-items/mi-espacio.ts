/**
 * Nav item "Mi espacio" (/mi-espacio) of the new shell (redesign FE §3.1, §21.1; Phase 5).
 * `resolve` returns the item, or null while it stays hidden: until the page's
 * read actions (notes, checklists, reminders, notifications) are implemented.
 * No badge read here: the badge (unread Bandeja items plus the reminders
 * still due today, frame `Sidebar`) comes from `qk.shell.badges()`.
 */
import { Inbox } from "lucide-react";

import { IMPLEMENTED as MY_SPACE_IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { IMPLEMENTED as NOTIFICATIONS_IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
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
  order: 55,
  resolve: async () => {
    if (!miEspacioAvailable()) return null;
    return { key: "mi-espacio", label: "Mi espacio", href: "/mi-espacio", icon: Inbox };
  },
};
