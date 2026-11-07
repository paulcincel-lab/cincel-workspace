/**
 * Sidebar slot "time-clock" (redesign FE §3.13, §21.1; Phase 6): loads
 * `TodayStatus` and renders `TimeClock` when time tracking is enabled for the
 * viewer and their role is not exempt (`TodayStatus.enabled` already folds in
 * the exempt roles, BE §8.7).
 *
 * Hidden while any clock action is still a stub in
 * `lib/actions/time-tracking-actions.flags.ts`, so nothing calls a write stub.
 */
import { TimeClock, timeClockReady } from "@/components/shell/TimeClock";
import { fetchMyTodayAction } from "@/lib/actions/time-tracking-actions";
import type { TodayStatus } from "@/lib/types/redesign";
import type { NavSession } from "@/lib/ui/nav";

import type { SidebarSlot } from "./index";

/** The viewer's `TodayStatus`, or null when the clock must stay hidden. */
export async function loadTimeClock(session: NavSession): Promise<TodayStatus | null> {
  void session;
  if (!timeClockReady()) return null;
  try {
    const today = await fetchMyTodayAction();
    return today.enabled ? today : null;
  } catch {
    return null;
  }
}

/** Sidebar card. */
export function TimeClockSlot({ data }: { data: TodayStatus }) {
  return <TimeClock initial={data} variant="card" />;
}

/** Mobile top-bar pill (< 768 px) opening a popover with the same controls. */
export function TimeClockCompactSlot({ data }: { data: TodayStatus }) {
  return <TimeClock initial={data} variant="compact" />;
}

export const timeClockSlot: SidebarSlot<TodayStatus> = {
  name: "time-clock",
  load: loadTimeClock,
  Component: TimeClockSlot,
};
