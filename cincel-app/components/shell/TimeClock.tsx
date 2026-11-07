"use client";

import type { TodayStatus } from "@/lib/types/redesign";

/**
 * Sidebar time clock (redesign FE §3.13): state pill, live time, progress and
 * the buttons per state, all from one `TodayStatus`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
/** `requiredFrom` and `hoursPerDay` are on `TodayStatus`. */
export type TimeClockProps = { initial: TodayStatus; variant?: "card" | "compact" };

export function TimeClock(props: TimeClockProps) {
  void props;
  return null;
}
