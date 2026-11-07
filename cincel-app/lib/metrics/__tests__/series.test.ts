import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { bucketTaskTrend, taskTrendBuckets, TASK_TREND_TIME_ZONE } from "@/lib/dashboard/task-trend";
import { DELTA_CAPTION, dailySeries, kpiFromDaily, weeklyCounts, type DailyPoint } from "@/lib/metrics/series";
import type { KpiDatum } from "@/lib/types/widgets";

function points(values: number[], start = "2026-10-01"): DailyPoint[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return values.map((value, i) => ({ date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10), value }));
}

describe("dailySeries", () => {
  // 2026-11-07 03:00 UTC is still 2026-11-06 in Mexico City.
  const now = new Date("2026-11-07T03:00:00Z");

  it("asks the counter for the local window and fills missing days with 0", async () => {
    const counter = vi.fn(async () => new Map([["2026-11-04", 3], ["2026-11-06", 5]]));
    const series = await dailySeries(counter, 4, now);
    expect(counter).toHaveBeenCalledWith("2026-11-03", "2026-11-06");
    expect(series).toEqual([
      { date: "2026-11-03", value: 0 },
      { date: "2026-11-04", value: 3 },
      { date: "2026-11-05", value: 0 },
      { date: "2026-11-06", value: 5 },
    ]);
  });

  it("uses the given time zone", async () => {
    const counter = vi.fn(async () => new Map<string, number>());
    const series = await dailySeries(counter, 1, now, "UTC");
    expect(series).toEqual([{ date: "2026-11-07", value: 0 }]);
  });

  it("crosses month boundaries", async () => {
    const counter = vi.fn(async () => new Map<string, number>());
    const series = await dailySeries(counter, 8, now, TASK_TREND_TIME_ZONE);
    expect(series[0].date).toBe("2026-10-30");
    expect(series).toHaveLength(8);
  });

  it("returns [] without calling the counter for no days", async () => {
    const counter = vi.fn(async () => new Map<string, number>());
    expect(await dailySeries(counter, 0, now)).toEqual([]);
    expect(counter).not.toHaveBeenCalled();
  });
});

describe("kpiFromDaily", () => {
  it("takes value, series7, delta and 30-day stats", () => {
    const values = Array.from({ length: 35 }, (_, i) => i + 1); // 1..35
    const kpi = kpiFromDaily("vencidas", "Vencidas", points(values), { goodWhen: "down", href: "/tareas" });
    expectTypeOf(kpi).toEqualTypeOf<KpiDatum>();
    expect(kpi).toEqual({
      key: "vencidas",
      label: "Vencidas",
      value: 35,
      series7: [29, 30, 31, 32, 33, 34, 35],
      delta: { value: 7, good: false, caption: DELTA_CAPTION },
      avg30: 20.5,
      min30: 6,
      max30: 35,
      href: "/tareas",
    });
  });

  it("marks a rise as good when goodWhen is up", () => {
    const kpi = kpiFromDaily("k", "K", points([1, 1, 1, 1, 1, 1, 1, 1, 4]), { goodWhen: "up" });
    expect(kpi.delta).toEqual({ value: 3, good: true, caption: "vs. semana pasada" });
  });

  it("marks a drop as good when goodWhen is down and bad when up", () => {
    const daily = points([9, 9, 9, 9, 9, 9, 9, 5]);
    expect(kpiFromDaily("k", "K", daily, { goodWhen: "down" }).delta).toEqual({
      value: -4,
      good: true,
      caption: DELTA_CAPTION,
    });
    expect(kpiFromDaily("k", "K", daily, { goodWhen: "up" }).delta?.good).toBe(false);
  });

  it("treats no change as good either way", () => {
    const daily = points([2, 2, 2, 2, 2, 2, 2, 2]);
    expect(kpiFromDaily("k", "K", daily, { goodWhen: "up" }).delta?.good).toBe(true);
    expect(kpiFromDaily("k", "K", daily, { goodWhen: "down" }).delta?.good).toBe(true);
  });

  it("uses the points there are with fewer than 30, and omits delta with fewer than 8", () => {
    const kpi = kpiFromDaily("k", "K", points([4, 1, 7]), { goodWhen: "up" });
    expect(kpi.value).toBe(7);
    expect(kpi.series7).toEqual([4, 1, 7]);
    expect(kpi.avg30).toBe(4);
    expect(kpi.min30).toBe(1);
    expect(kpi.max30).toBe(7);
    expect(kpi.delta).toBeUndefined();
  });

  it("rounds the average to one decimal", () => {
    expect(kpiFromDaily("k", "K", points([1, 1, 2]), { goodWhen: "up" }).avg30).toBe(1.3);
  });

  it("formats the value with display", () => {
    const kpi = kpiFromDaily("h", "Horas", points([7.5]), { goodWhen: "up", display: (v) => `${v} h` });
    expect(kpi.display).toBe("7.5 h");
  });

  it("returns a zero shape for an empty series", () => {
    expect(kpiFromDaily("k", "K", [], { goodWhen: "up" })).toEqual({
      key: "k",
      label: "K",
      value: 0,
      series7: [],
      avg30: 0,
      min30: 0,
      max30: 0,
    });
  });
});

describe("weeklyCounts", () => {
  it("matches bucketTaskTrend over the same buckets", () => {
    const now = new Date("2026-11-07T18:00:00Z");
    const buckets = taskTrendBuckets("mes", now, TASK_TREND_TIME_ZONE);
    const createdAt = [
      new Date("2026-11-02T18:00:00Z"),
      new Date("2026-11-03T18:00:00Z"),
      new Date("2026-11-12T18:00:00Z"),
    ];
    const completions = [{ taskId: "a", at: new Date("2026-11-04T18:00:00Z") }];
    const trend = bucketTaskTrend({ buckets, timeZone: TASK_TREND_TIME_ZONE, createdAt, completions });

    const rows = weeklyCounts(buckets, {
      created: (b) => trend.created[buckets.indexOf(b)],
      completed: (b) => trend.completed[buckets.indexOf(b)],
    });

    expect(rows).toHaveLength(buckets.length);
    expect(rows.map((r) => r.weekStart)).toEqual(buckets.map((b) => b.from));
    expect(rows.map((r) => r.created)).toEqual(trend.created);
    expect(rows.map((r) => r.completed)).toEqual(trend.completed);
    expect(rows[0]).toEqual({ weekStart: "2026-11-01", created: 0, completed: 0 });
    expect(rows[1]).toEqual({ weekStart: "2026-11-02", created: 2, completed: 1 });
  });

  it("keeps weekStart even if a counter has that name", () => {
    const rows = weeklyCounts([{ label: "S45", from: "2026-11-02", to: "2026-11-08" }], { weekStart: () => 9, n: () => 1 });
    expect(rows).toEqual([{ weekStart: "2026-11-02", n: 1 }]);
  });

  it("returns [] for no buckets", () => {
    expect(weeklyCounts([], { created: () => 1 })).toEqual([]);
  });
});
