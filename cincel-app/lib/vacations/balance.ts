/**
 * Vacation balance (redesign BE §8.8): `entitled` = `staff_profiles.vacation_days`
 * or the org `daysPerYear`; `taken`, `pending`, `available`. Request `days` =
 * work days of `TimeTrackingSettings.workDays` in the range.
 */
import { notImplemented } from "@/lib/stubs";
import type { VacationBalance, VacationRequest } from "@/lib/types/redesign";

export const VACATIONS_SETTING_KEY = "vacations";

/** The seeded org default (BE §4). */
export const DEFAULT_VACATION_DAYS_PER_YEAR = 12;

export function workDaysInRange(from: string, to: string, workDays: number[]): number {
  return notImplemented("workDaysInRange", from, to, workDays);
}

export function vacationBalance(input: {
  entitled: number;
  requests: (VacationRequest & { days: number })[];
  today: string;
}): VacationBalance {
  return notImplemented("vacationBalance", input);
}
