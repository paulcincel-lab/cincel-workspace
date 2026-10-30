import { describe, expect, it } from "vitest";

import { TASK_TREND_TIME_ZONE, bucketTaskTrend, taskTrendBuckets, taskTrendQueryWindow } from "./task-trend";

const TZ = TASK_TREND_TIME_ZONE; // America/Mexico_City, UTC-6
// Thursday 29 Oct 2026, 12:00 local.
const NOW = new Date("2026-10-29T18:00:00Z");

const at = (iso: string) => new Date(iso);

function trend(range: "semana" | "mes", createdAt: Date[], completions: Array<{ taskId: string; at: Date }> = []) {
  return bucketTaskTrend({
    buckets: taskTrendBuckets(range, NOW, TZ),
    timeZone: TZ,
    createdAt,
    completions,
  });
}

describe("taskTrendBuckets", () => {
  it("semana: Monday to Sunday of the current week, one bucket per day", () => {
    const buckets = taskTrendBuckets("semana", NOW, TZ);
    expect(buckets.map((b) => b.label)).toEqual(["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]);
    expect(buckets[0]).toEqual({
      label: "LUN",
      from: "2026-10-26",
      to: "2026-10-26",
    });
    expect(buckets[6]).toEqual({
      label: "DOM",
      from: "2026-11-01",
      to: "2026-11-01",
    });
  });

  it("uses the app time zone for today, not UTC", () => {
    // Monday 02:00 UTC is still Sunday 1 Nov in Mexico City.
    const buckets = taskTrendBuckets("semana", at("2026-11-02T02:00:00Z"), TZ);
    expect(buckets[0].from).toBe("2026-10-26");
  });

  it("mes: one bucket per ISO week, clipped to the month", () => {
    expect(taskTrendBuckets("mes", NOW, TZ)).toEqual([
      { label: "S40", from: "2026-10-01", to: "2026-10-04" },
      { label: "S41", from: "2026-10-05", to: "2026-10-11" },
      { label: "S42", from: "2026-10-12", to: "2026-10-18" },
      { label: "S43", from: "2026-10-19", to: "2026-10-25" },
      { label: "S44", from: "2026-10-26", to: "2026-10-31" },
    ]);
  });

  it("mes: labels the week across new year with its ISO week", () => {
    const buckets = taskTrendBuckets("mes", at("2027-01-15T18:00:00Z"), TZ);
    expect(buckets[0]).toEqual({
      label: "S53",
      from: "2027-01-01",
      to: "2027-01-03",
    });
    expect(buckets[1].label).toBe("S1");
  });

  it("query window covers every bucket in UTC", () => {
    const { from, to } = taskTrendQueryWindow(taskTrendBuckets("semana", NOW, TZ));
    expect(from.getTime()).toBeLessThanOrEqual(at("2026-10-26T06:00:00Z").getTime());
    expect(to.getTime()).toBeGreaterThan(at("2026-11-02T05:59:59Z").getTime());
  });
});

describe("bucketTaskTrend", () => {
  it("returns zeros for empty buckets", () => {
    expect(trend("semana", [])).toEqual({
      labels: ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"],
      created: [0, 0, 0, 0, 0, 0, 0],
      completed: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(trend("mes", []).created).toEqual([0, 0, 0, 0, 0]);
  });

  it("buckets created dates by local day, at the day edges", () => {
    const result = trend("semana", [
      at("2026-10-26T06:00:00Z"), // Mon 00:00 local
      at("2026-10-27T05:59:59Z"), // Mon 23:59 local
      at("2026-10-27T06:00:00Z"), // Tue 00:00 local
      at("2026-10-26T05:59:59Z"), // Sun 25 Oct local: previous week
      at("2026-11-02T05:59:59Z"), // Sun 1 Nov 23:59 local
      at("2026-11-02T06:00:00Z"), // Mon 2 Nov local: next week
    ]);
    expect(result.created).toEqual([2, 1, 0, 0, 0, 0, 1]);
  });

  it("buckets by week in the month, at the week and month edges", () => {
    const result = trend("mes", [
      at("2026-10-01T05:59:59Z"), // 30 Sep local: outside the month
      at("2026-10-01T06:00:00Z"), // 1 Oct
      at("2026-10-05T05:59:59Z"), // Sun 4 Oct 23:59
      at("2026-10-05T06:00:00Z"), // Mon 5 Oct
      at("2026-11-01T05:59:59Z"), // 31 Oct 23:59
      at("2026-11-01T06:00:00Z"), // 1 Nov: outside the month
    ]);
    expect(result.created).toEqual([2, 1, 0, 0, 1]);
  });

  it("counts a task completed twice in one bucket once, and once in each bucket", () => {
    const result = trend(
      "semana",
      [],
      [
        { taskId: "a", at: at("2026-10-26T15:00:00Z") },
        { taskId: "a", at: at("2026-10-26T20:00:00Z") },
        { taskId: "a", at: at("2026-10-28T15:00:00Z") },
        { taskId: "b", at: at("2026-10-26T16:00:00Z") },
      ]
    );
    expect(result.completed).toEqual([2, 0, 1, 0, 0, 0, 0]);
  });

  it("keeps a reopened task in the bucket it was completed in", () => {
    // Completed Monday, reopened later: only the completado event counts.
    const result = trend("semana", [at("2026-10-26T15:00:00Z")], [{ taskId: "a", at: at("2026-10-26T18:00:00Z") }]);
    expect(result.created).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(result.completed).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });
});
