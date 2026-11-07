/**
 * Vacation balance (redesign BE §8.8): `entitled` = `staff_profiles.vacation_days`
 * or the org `daysPerYear`; `taken`, `pending`, `available`. Request `days` =
 * work days of `TimeTrackingSettings.workDays` in the range. Pure and
 * client-safe: dates are ISO `YYYY-MM-DD` handled as UTC midnights.
 */
import type { VacationBalance, VacationRequest } from "@/lib/types/redesign";

export const VACATIONS_SETTING_KEY = "vacations";

/** The seeded org default (BE §4). */
export const DEFAULT_VACATION_DAYS_PER_YEAR = 12;

/** Longest request in calendar days (`requestVacationAction`, BE §7.8). */
export const MAX_REQUEST_CALENDAR_DAYS = 30;

const DAY_MS = 86_400_000;

function parseIso(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `date` plus `days` calendar days. */
export function addDays(date: string, days: number): string {
  const d = parseIso(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Calendar days in `[from, to]`, both included (0 when `to < from`). */
export function calendarDaysInRange(from: string, to: string): number {
  const diff = Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / DAY_MS);
  return diff < 0 ? 0 : diff + 1;
}

/**
 * Days of `[from, to]` (both included) whose weekday (0 = domingo … 6 =
 * sábado, like `TimeTrackingSettings.workDays`) is a work day. Holidays are
 * out of scope.
 */
export function workDaysInRange(from: string, to: string, workDays: number[]): number {
  const total = calendarDaysInRange(from, to);
  if (total === 0) return 0;
  const set = new Set(workDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  if (set.size === 0) return 0;
  const startDow = parseIso(from).getUTCDay();
  let count = Math.floor(total / 7) * set.size;
  for (let i = 0; i < total % 7; i++) {
    if (set.has((startDow + i) % 7)) count++;
  }
  return count;
}

/** `staff_profiles.vacation_days` when set, else the org `daysPerYear` (review B12). */
export function entitledDays(override: number | null | undefined, daysPerYear: number): number {
  return override ?? daysPerYear;
}

export type BalanceRequest = Pick<VacationRequest, "from" | "to" | "status"> & { days: number };

/**
 * The balance of the year of `today` (BE §8.8):
 * - `taken` = days of `aprobada` requests starting this year that already
 *   ended (`to < today`), plus the elapsed part (up to and including today)
 *   of one in progress;
 * - `pending` = days of `pendiente` requests starting this year;
 * - `available` = `entitled − taken − pending − aprobada still ahead`.
 * It can go negative: requests are never blocked by the balance.
 */
export function vacationBalance(input: {
  entitled: number;
  requests: BalanceRequest[];
  today: string;
  /** `TimeTrackingSettings.workDays`; Monday to Friday when omitted. */
  workDays?: number[];
}): VacationBalance {
  const { entitled, requests, today } = input;
  const workDays = input.workDays ?? [1, 2, 3, 4, 5];
  const year = today.slice(0, 4);
  let taken = 0;
  let pending = 0;
  let ahead = 0;

  for (const r of requests) {
    if (r.from.slice(0, 4) !== year) continue;
    if (r.status === "pendiente") {
      pending += r.days;
    } else if (r.status === "aprobada") {
      if (r.to < today) {
        taken += r.days;
      } else if (r.from > today) {
        ahead += r.days;
      } else {
        const elapsed = Math.min(workDaysInRange(r.from, today, workDays), r.days);
        taken += elapsed;
        ahead += r.days - elapsed;
      }
    }
  }

  return { entitled, taken, pending, available: entitled - taken - pending - ahead };
}

/** First and last day of a `YYYY-MM` month. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
