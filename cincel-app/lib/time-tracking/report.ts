/**
 * Weekly hours report (redesign BE §8.7): hours per day (lunch deducted on
 * days ≥ 5 h without a pause ≥ 30 min), target minus approved vacations,
 * status completo / incompleto / sin_registro, late count.
 */
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";
import type { TeamHoursRow, TimeTrackingSettings } from "@/lib/types/redesign";

export async function teamHoursReport(
  db: OwnerDb,
  weekStart: string,
  settings: TimeTrackingSettings,
): Promise<TeamHoursRow[]> {
  return notImplemented("teamHoursReport", db, weekStart, settings);
}
