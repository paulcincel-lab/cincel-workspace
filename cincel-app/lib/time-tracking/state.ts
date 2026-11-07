/**
 * State of today (redesign BE §8.7): no entry → `off`; open entry with an
 * open last pause → `pausa`; open → `on`; entries but none open → `done`.
 * `workedSeconds` = Σ (ended_at ?? now) − started_at − Σ pauses. Pure.
 */
import type { TimeEntryRow } from "@/lib/repositories/time-entries-repository";
import { notImplemented } from "@/lib/stubs";
import type { TimeTrackingSettings, TodayStatus } from "@/lib/types/redesign";

export function todayStatus(input: {
  entries: TimeEntryRow[];
  settings: TimeTrackingSettings;
  role: string;
  now: Date;
}): TodayStatus {
  return notImplemented("todayStatus", input);
}
