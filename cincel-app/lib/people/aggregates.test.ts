import { describe, expect, it } from "vitest";

import { fourWeeks, weekLoads } from "./aggregates";

describe("fourWeeks", () => {
  it("returns the 4 Mondays from this week, crossing a month and a year", () => {
    expect(fourWeeks("2026-12-23")).toEqual(["2026-12-21", "2026-12-28", "2027-01-04", "2027-01-11"]);
    expect(fourWeeks("2026-11-27")).toEqual(["2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14"]);
  });

  it("treats Sunday as the end of its week and Monday as the start", () => {
    expect(fourWeeks("2026-11-15")[0]).toBe("2026-11-09");
    expect(fourWeeks("2026-11-16")[0]).toBe("2026-11-16");
  });
});

describe("weekLoads", () => {
  const TODAY = "2026-11-11"; // Wednesday

  it("counts overdue + undated + due this week in week 1, and each later week by due date", () => {
    const weeks = weekLoads({
      today: TODAY,
      capacity: 10,
      dueDates: ["2026-11-02", null, "2026-11-15", "2026-11-16", "2026-11-22", "2026-12-07"],
      absences: [],
    });
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
    expect(weeks.map((w) => w.open)).toEqual([3, 2, 0, 0]);
    expect(weeks.map((w) => w.occupancyPct)).toEqual([30, 20, 0, 0]);
    expect(weeks.every((w) => w.absentDays === 0)).toBe(true);
  });

  it("counts a task due on Sunday in that week, not the next one", () => {
    const weeks = weekLoads({ today: TODAY, capacity: 5, dueDates: ["2026-11-22"], absences: [] });
    expect(weeks.map((w) => w.open)).toEqual([0, 1, 0, 0]);
  });

  it("gives 0 % with capacity 0", () => {
    const weeks = weekLoads({ today: TODAY, capacity: 0, dueDates: [null, "2026-11-17"], absences: [] });
    expect(weeks.map((w) => w.open)).toEqual([1, 1, 0, 0]);
    expect(weeks.map((w) => w.occupancyPct)).toEqual([0, 0, 0, 0]);
  });

  it("lowers the week's capacity by the absence days: 5 days → 0 %, 2 days → capacity × 3 ÷ 5", () => {
    const weeks = weekLoads({
      today: TODAY,
      capacity: 10,
      dueDates: ["2026-11-18", "2026-11-25"],
      absences: [
        { from: "2026-11-16", to: "2026-11-20" },
        { from: "2026-11-23", to: "2026-11-24" },
        // Saturday to Monday: only the Monday is a work day.
        { from: "2026-11-28", to: "2026-11-30" },
      ],
    });
    expect(weeks.map((w) => w.absentDays)).toEqual([0, 5, 2, 1]);
    expect(weeks[1]).toMatchObject({ open: 1, occupancyPct: 0 });
    // 1 task ÷ (10 × 3 ÷ 5 = 6) = 17 %.
    expect(weeks[2]).toMatchObject({ open: 1, occupancyPct: 17 });
  });
});
