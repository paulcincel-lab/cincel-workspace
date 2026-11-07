/**
 * Weekly hours target (redesign BE §8.7): `hoursPerDay × (work days in the
 * week − work days covered by aprobada vacations)`; no holidays. Pure.
 */
import { dayOfWeek, weekDates } from "@/lib/time-tracking/local-time";
import type { TimeTrackingSettings } from "@/lib/types/redesign";

export function weekTarget(
  settings: Pick<TimeTrackingSettings, "hoursPerDay" | "workDays">,
  weekStart: string,
  absences: { from: string; to: string }[],
): number {
  const days = weekDates(weekStart).filter(
    (date) =>
      settings.workDays.includes(dayOfWeek(date)) &&
      !absences.some((absence) => absence.from <= date && date <= absence.to),
  );
  return Math.round(settings.hoursPerDay * days.length * 100) / 100;
}
