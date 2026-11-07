/**
 * Phase 1 read helper (redesign BE §8.12): worked hours per staff and day of
 * one week (§8.7 rules, lunch deduction). Zeros until entries exist.
 */
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";
import type { DayHours, TimeTrackingSettings } from "@/lib/types/redesign";

export async function weekHours(
  db: OwnerDb,
  staffIds: string[],
  weekStart: string,
  settings: TimeTrackingSettings,
): Promise<Map<string, { days: DayHours[]; total: number }>> {
  return notImplemented("weekHours", db, staffIds, weekStart, settings);
}
