/**
 * Metrics helper (redesign BE §8.0.1): one implementation for every KPI and
 * series. Extends `lib/dashboard/task-trend.ts`.
 */
import { TASK_TREND_TIME_ZONE, type TaskTrendBucket } from "@/lib/dashboard/task-trend";
import { notImplemented } from "@/lib/stubs";
import type { KpiDatum } from "@/lib/types/widgets";

/** Local ISO date → value, for `[from, to]` (one SQL `generate_series` per producer). */
export type DailyCounter = (from: string, to: string) => Promise<Map<string, number>>;

export type DailyPoint = { date: string; value: number };

/** The last `days` local dates ending today, with the counter's values (0 when missing). */
export async function dailySeries(
  counter: DailyCounter,
  days: number,
  now: Date,
  tz: string = TASK_TREND_TIME_ZONE,
): Promise<DailyPoint[]> {
  return notImplemented("dailySeries", counter, days, now, tz);
}

/**
 * value = last point; series7 = last 7; delta = last − point 7 days earlier
 * (`good` from `goodWhen`, caption "vs. semana pasada"); avg30 / min30 / max30
 * over the last 30 points.
 */
export function kpiFromDaily(
  key: string,
  label: string,
  daily: DailyPoint[],
  opts: { goodWhen: "up" | "down"; display?: (v: number) => string; href?: string },
): KpiDatum {
  return notImplemented("kpiFromDaily", key, label, daily, opts);
}

/** Weekly counts over task-trend buckets; feeds `InicioData.weeklyPace` and the Analítico weekly tables. */
export function weeklyCounts(
  buckets: TaskTrendBucket[],
  counters: Record<string, (b: TaskTrendBucket) => number>,
): { weekStart: string; [k: string]: number | string }[] {
  return notImplemented("weeklyCounts", buckets, counters);
}
