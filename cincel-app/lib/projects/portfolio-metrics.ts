/**
 * Pure numbers behind one `PortfolioRow` (redesign BE §7.12): real vs plan,
 * deviation and budget spent from the project's Cronograma when it has one,
 * days to delivery and the local date window of the 7-day series. No DB, no
 * clock: `today` / `todayIso` are always injected.
 */
import { computeProgress } from "@/lib/cronograma/metrics";
import type { PaymentRow, ScheduleTask } from "@/lib/types/schedule";

const DAY_MS = 86_400_000;

export type PortfolioSchedule = { tasks: ScheduleTask[]; payments: PaymentRow[] };

export type PortfolioProgress = {
  real: number;
  plan: number | null;
  deviation: number | null;
  /** Raw value; the caller nulls it for viewers without `canSeeAdminData`. */
  budgetSpentPct: number | null;
};

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** `real − plan` in points; null while there is no plan. */
export function deviationOf(real: number, plan: number | null): number | null {
  return plan === null ? null : real - plan;
}

/**
 * Real is the Cronograma progress when the project has a schedule with rows,
 * else `projects.progress`. Plan is the schedule's planned % for the current
 * week (null without a schedule). Budget spent is the payment calendar's paid
 * % in effect this week (null without payment rows).
 */
export function portfolioProgress(
  input: { progress: number; schedule: PortfolioSchedule | null },
  today: Date,
): PortfolioProgress {
  const schedule = input.schedule;
  if (!schedule || schedule.tasks.length === 0) {
    const budgetSpentPct =
      schedule && schedule.payments.length > 0
        ? clampPct(computeProgress(schedule, today).pagosPagadoPct)
        : null;
    return { real: clampPct(input.progress), plan: null, deviation: null, budgetSpentPct };
  }
  const metrics = computeProgress(schedule, today);
  const real = clampPct(metrics.realPct);
  const plan = clampPct(metrics.plannedPct);
  return {
    real,
    plan,
    deviation: deviationOf(real, plan),
    budgetSpentPct: schedule.payments.length > 0 ? clampPct(metrics.pagosPagadoPct) : null,
  };
}

/**
 * What `portfolioProgress` reads from a schedule, aggregated in SQL: task
 * counts by status and by `fin <= weekEnd`, and the paid % of the payment row
 * in effect at the week's end (`pagosRowForDate`). `paidPct` is null when
 * the schedule has no payment rows or the caller did not read them.
 */
export type PortfolioScheduleCounts = {
  total: number;
  done: number;
  progress: number;
  /** Tasks whose `fin` is on or before the current week's end. */
  planned: number;
  paidPct: number | null;
};

/** `portfolioProgress` from SQL aggregates: the same numbers without loading the schedule rows. */
export function portfolioProgressFromCounts(
  input: { progress: number; schedule: PortfolioScheduleCounts | null },
): PortfolioProgress {
  const schedule = input.schedule;
  const budgetSpentPct = schedule && schedule.paidPct !== null ? clampPct(schedule.paidPct) : null;
  if (!schedule || schedule.total === 0) {
    return { real: clampPct(input.progress), plan: null, deviation: null, budgetSpentPct };
  }
  const real = clampPct(Math.round(((schedule.done + schedule.progress * 0.5) / schedule.total) * 100));
  const plan = clampPct(Math.round((schedule.planned / schedule.total) * 100));
  return { real, plan, deviation: deviationOf(real, plan), budgetSpentPct };
}

function isoToUtcMs(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

/** Whole calendar days from `fromIso` to `toIso` (negative when `toIso` is earlier). */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / DAY_MS);
}

/** `YYYY-MM-DD` `days` calendar days after (or before, when negative) `iso`. */
export function addDaysIso(iso: string, days: number): string {
  return new Date(isoToUtcMs(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The `days` local dates ending on `todayIso`, oldest first. */
export function lastDaysIso(todayIso: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDaysIso(todayIso, i - (days - 1)));
}

/** Series values for `dates`, 0 where the counter has no row. */
export function seriesFor(dates: string[], byDate: Map<string, number> | undefined): number[] {
  return dates.map((d) => byDate?.get(d) ?? 0);
}
