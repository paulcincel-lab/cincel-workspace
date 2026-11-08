/**
 * Sidebar slot "time-clock" (redesign FE §3.13, §21.1; Phase 6): the
 * `TimeClock` card. It reads `useQuery(qk.me.today())`, which the `(staff)`
 * layout hydrates; the shell mounts the slot only when time tracking is
 * enabled for the viewer and their role is not exempt (`TodayStatus.enabled`
 * already folds in the exempt roles, BE §8.7). No server reads of its own.
 *
 * `TimeClock` stays hidden while any clock action is still a stub in
 * `lib/actions/time-tracking-actions.flags.ts`, so nothing calls a write stub.
 */
import { TimeClock } from "@/components/shell/TimeClock";

import type { SidebarSlot } from "./index";

/** Sidebar card. */
export function TimeClockSlot() {
  return <TimeClock variant="card" />;
}

/** Mobile top-bar pill (< 768 px) opening a popover with the same controls. */
export function TimeClockCompactSlot() {
  return <TimeClock variant="compact" />;
}

export const timeClockSlot: SidebarSlot = {
  name: "time-clock",
  Component: TimeClockSlot,
};
