import { describe, expect, it } from "vitest";

import type { PaymentRow, ScheduleStatus, ScheduleTask } from "@/lib/types/schedule";
import {
  addDaysIso,
  daysBetweenIso,
  deviationOf,
  lastDaysIso,
  portfolioProgress,
  seriesFor,
} from "./portfolio-metrics";

function task(fin: string, status: ScheduleStatus, i: number): ScheduleTask {
  return {
    id: `t${i}`,
    stableKey: `k${i}`,
    legacyId: null,
    planta: "PB",
    seccion: "Obra negra",
    responsable: null,
    inicio: "2026-10-01",
    fin,
    tarea: `Partida ${i}`,
    status,
    flagged: false,
  };
}

// Wednesday; the schedule week ends Sunday 2026-11-08.
const today = new Date("2026-11-04T00:00:00");

const tasks: ScheduleTask[] = [
  task("2026-11-01", "done", 1),
  task("2026-11-06", "progress", 2),
  task("2026-11-20", "pending", 3),
  task("2026-12-01", "pending", 4),
];

const payments: PaymentRow[] = [
  { fecha: "2026-10-01", pagadoPct: 20, avancePct: 25 },
  { fecha: "2026-11-02", pagadoPct: 45.5, avancePct: 50 },
  { fecha: "2026-12-01", pagadoPct: 80, avancePct: 90 },
];

describe("portfolioProgress", () => {
  it("uses the Cronograma when the project has a schedule: real, plan and deviation in points", () => {
    const out = portfolioProgress({ progress: 90, schedule: { tasks, payments } }, today);
    // planned: 2 of 4 end by the week end → 50; real: (1 + 0.5) / 4 → 37.5 → 38.
    expect(out.plan).toBe(50);
    expect(out.real).toBe(38);
    expect(out.deviation).toBe(-12);
    // Payment row in effect this week: 2026-11-02 → 45.5 → 46.
    expect(out.budgetSpentPct).toBe(46);
  });

  it("falls back to projects.progress without a schedule; plan and deviation are null", () => {
    const out = portfolioProgress({ progress: 63, schedule: null }, today);
    expect(out).toEqual({ real: 63, plan: null, deviation: null, budgetSpentPct: null });
  });

  it("falls back to projects.progress when the schedule has no rows, keeping the payment calendar", () => {
    const out = portfolioProgress({ progress: 10, schedule: { tasks: [], payments } }, today);
    expect(out.real).toBe(10);
    expect(out.plan).toBeNull();
    expect(out.deviation).toBeNull();
    expect(out.budgetSpentPct).toBe(46);
  });

  it("has no budget when the schedule has no payment calendar", () => {
    const out = portfolioProgress({ progress: 0, schedule: { tasks, payments: [] } }, today);
    expect(out.budgetSpentPct).toBeNull();
    expect(out.plan).toBe(50);
  });

  it("is positive when real is ahead of plan", () => {
    const ahead = [task("2026-11-01", "done", 1), task("2026-12-01", "done", 2)];
    const out = portfolioProgress({ progress: 0, schedule: { tasks: ahead, payments: [] } }, today);
    expect(out.plan).toBe(50);
    expect(out.real).toBe(100);
    expect(out.deviation).toBe(50);
  });

  it("clamps projects.progress to 0–100", () => {
    expect(portfolioProgress({ progress: 140, schedule: null }, today).real).toBe(100);
    expect(portfolioProgress({ progress: -5, schedule: null }, today).real).toBe(0);
  });
});

describe("deviationOf", () => {
  it("is real − plan, null without a plan", () => {
    expect(deviationOf(70, 80)).toBe(-10);
    expect(deviationOf(80, 70)).toBe(10);
    expect(deviationOf(40, null)).toBeNull();
  });
});

describe("date helpers", () => {
  it("counts calendar days to the delivery date", () => {
    expect(daysBetweenIso("2026-11-07", "2026-11-30")).toBe(23);
    expect(daysBetweenIso("2026-11-07", "2026-11-07")).toBe(0);
    expect(daysBetweenIso("2026-11-07", "2026-11-01")).toBe(-6);
    expect(daysBetweenIso("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("builds the last 7 local dates, oldest first", () => {
    const dates = lastDaysIso("2026-11-03", 7);
    expect(dates).toEqual([
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("fills missing days with 0 and always returns one value per date", () => {
    const dates = lastDaysIso("2026-11-07", 7);
    expect(seriesFor(dates, undefined)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(seriesFor(dates, new Map([["2026-11-07", 3], ["2026-11-01", 1]]))).toEqual([1, 0, 0, 0, 0, 0, 3]);
  });
});
