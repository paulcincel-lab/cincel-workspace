/**
 * Sidebar slot "bandeja-badge" (redesign FE §3.1, §21.1; Phase 5; frame
 * `Sidebar`): the Mi espacio nav item badge, unread Bandeja items plus the
 * reminders still due today. No server reads: the view reads
 * `useQuery(qk.shell.badges())`, which the `(staff)` layout prefetches
 * (`loadShellBadges`, `lib/shell/badges.ts`) and the 60 s poll keeps fresh.
 * Hidden while `fetchNotificationsAction` is a stub (`isBandejaBadgeVisible`).
 */
import { BandejaBadge } from "./bandeja-badge-view";
import type { SidebarSlot } from "./index";

export const bandejaBadgeSlot: SidebarSlot = {
  name: "bandeja-badge",
  Component: BandejaBadge,
};
