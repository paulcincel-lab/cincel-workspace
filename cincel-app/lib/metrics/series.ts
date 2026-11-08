/**
 * Metrics helper (redesign BE §8.0.1): one implementation for every KPI and
 * series. Extends `lib/dashboard/task-trend.ts`. Pure and isomorphic: the
 * only I/O is the producer's `DailyCounter`.
 */
import { localIsoDate, TASK_TREND_TIME_ZONE, type TaskTrendBucket } from "@/lib/dashboard/task-trend";
import type { KpiDatum, KpiDeltaTone } from "@/lib/types/widgets";

/** Local ISO date → value, for `[from, to]` (one SQL `generate_series` per producer). */
export type DailyCounter = (from: string, to: string) => Promise<Map<string, number>>;

export type DailyPoint = { date: string; value: number };

/** Caption of the week-over-week delta. */
export const DELTA_CAPTION = "vs. semana pasada";

/** Chip text of a zero delta (frame `Dashboard`). */
export const DELTA_UNCHANGED = "sin cambio";

/** Chip suffix per window: change over the last 7 days or since the month began. */
export const DELTA_WINDOW_SUFFIX = { semana: "vs. semana", mes: "este mes" } as const;

export type DeltaWindow = keyof typeof DELTA_WINDOW_SUFFIX;

const deltaNumber = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/** Signed delta text ("+3", "−2", "0") in es-MX. */
export function formatSignedDelta(value: number): string {
  const abs = deltaNumber.format(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

/** Tone of a change: zero is `neutral`, else `good` / `bad` by `goodWhen`. */
export function deltaTone(change: number, goodWhen: "up" | "down"): KpiDeltaTone {
  if (change === 0) return "neutral";
  return (goodWhen === "up" ? change > 0 : change < 0) ? "good" : "bad";
}

/** Chip text of a change: "+4 vs. semana", "−1 este mes", "sin cambio". */
export function deltaLabel(change: number, span: DeltaWindow = "semana"): string {
  if (change === 0) return DELTA_UNCHANGED;
  return `${formatSignedDelta(change)} ${DELTA_WINDOW_SUFFIX[span]}`;
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` shifted by `n` calendar days (UTC midnights, no local clock). */
function shiftIso(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The last `days` local dates ending today, with the counter's values (0 when missing). */
export async function dailySeries(
  counter: DailyCounter,
  days: number,
  now: Date,
  tz: string = TASK_TREND_TIME_ZONE,
): Promise<DailyPoint[]> {
  const count = Math.floor(days);
  if (!(count > 0)) return [];
  const to = localIsoDate(now, tz);
  const from = shiftIso(to, -(count - 1));
  const values = await counter(from, to);
  return Array.from({ length: count }, (_, i) => {
    const date = shiftIso(from, i);
    const value = values.get(date);
    return { date, value: typeof value === "number" && Number.isFinite(value) ? value : 0 };
  });
}

/**
 * The point the "este mes" chip compares against: the last day of the
 * previous month when the series has it, else the oldest point.
 */
function monthBaseline(daily: DailyPoint[]): number {
  const last = daily[daily.length - 1];
  const monthStart = `${last.date.slice(0, 7)}-01`;
  const before = daily.filter((p) => p.date < monthStart);
  return (before.length > 0 ? before[before.length - 1] : daily[0]).value;
}

/**
 * value = last point; series7 = last 7; delta = last − point 7 days earlier
 * (`good` from `goodWhen`, caption "vs. semana pasada"); avg30 / min30 / max30
 * over the last 30 points.
 *
 * `delta.label` / `delta.tone` are the Visual chip: the change over
 * `deltaWindow` ("semana" = the same 7-day change, "mes" = since the end of
 * the previous month), "sin cambio" and `neutral` when it is zero.
 *
 * With fewer than 30 points the stats cover the points there are; with fewer
 * than 8 there is no point 7 days earlier, so `delta` is omitted. An empty
 * series yields zeros and an empty `series7`. A zero delta counts as good.
 */
export function kpiFromDaily(
  key: string,
  label: string,
  daily: DailyPoint[],
  opts: {
    goodWhen: "up" | "down";
    display?: (v: number) => string;
    href?: string;
    deltaWindow?: DeltaWindow;
  },
): KpiDatum {
  const values = daily.map((p) => p.value);
  const value = values.length > 0 ? values[values.length - 1] : 0;
  const last30 = values.slice(-30);

  const kpi: KpiDatum = {
    key,
    label,
    value,
    series7: values.slice(-7),
    avg30: last30.length > 0 ? round1(last30.reduce((sum, v) => sum + v, 0) / last30.length) : 0,
    min30: last30.length > 0 ? Math.min(...last30) : 0,
    max30: last30.length > 0 ? Math.max(...last30) : 0,
  };

  if (values.length >= 8) {
    const change = value - values[values.length - 8];
    const chipWindow = opts.deltaWindow ?? "semana";
    const chipChange = chipWindow === "mes" ? value - monthBaseline(daily) : change;
    kpi.delta = {
      value: change,
      good: opts.goodWhen === "up" ? change >= 0 : change <= 0,
      caption: DELTA_CAPTION,
      label: deltaLabel(chipChange, chipWindow),
      tone: deltaTone(chipChange, opts.goodWhen),
    };
  }
  if (opts.display) kpi.display = opts.display(value);
  if (opts.href) kpi.href = opts.href;
  return kpi;
}

/**
 * Weekly counts over task-trend buckets (`taskTrendBuckets` or any
 * `TaskTrendBucket[]`): one row per bucket, `weekStart` = the bucket's first
 * day, one column per counter (a counter named `weekStart` is ignored). Feeds
 * `InicioData.weeklyPace` and the Analítico weekly tables.
 */
export function weeklyCounts(
  buckets: TaskTrendBucket[],
  counters: Record<string, (b: TaskTrendBucket) => number>,
): { weekStart: string; [k: string]: number | string }[] {
  const entries = Object.entries(counters).filter(([name]) => name !== "weekStart");
  return buckets.map((bucket) => {
    const row: { weekStart: string; [k: string]: number | string } = { weekStart: bucket.from };
    for (const [name, count] of entries) row[name] = count(bucket);
    return row;
  });
}
