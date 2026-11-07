/**
 * Sidebar slot "time-clock" (redesign FE §3.13, §21.1; Phase 6): loads
 * `TodayStatus` and renders `TimeClock` when time tracking is enabled for the
 * viewer and their role is not exempt.
 *
 * Contract stub: hidden (`IMPLEMENTED.clockInAction` is false).
 */
import type { TodayStatus } from "@/lib/types/redesign";

import type { SidebarSlot } from "./index";

function TimeClockSlot(props: { data: TodayStatus }) {
  void props;
  return null;
}

export const timeClockSlot: SidebarSlot<TodayStatus> = {
  name: "time-clock",
  load: async () => null,
  Component: TimeClockSlot,
};
