/**
 * Sidebar slot "bandeja-badge" (redesign FE §3.1, §21.1; Phase 5): loads the
 * caller's `unreadCount` for the Mi espacio nav item badge.
 *
 * Contract stub: hidden (notification actions are stubs).
 */
import type { SidebarSlot } from "./index";

function BandejaBadgeSlot(props: { data: { unreadCount: number } }) {
  void props;
  return null;
}

export const bandejaBadgeSlot: SidebarSlot<{ unreadCount: number }> = {
  name: "bandeja-badge",
  load: async () => null,
  Component: BandejaBadgeSlot,
};
