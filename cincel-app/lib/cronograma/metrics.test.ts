import { describe, expect, it } from "vitest";
import { computeAlertas, computeProgress } from "./metrics";
import type { PaymentRow, ScheduleTask } from "@/lib/types/schedule";
import md22Tasks from "./__fixtures__/md22-schedule-tasks.json";
import expectedByDate from "./__fixtures__/md22-expected-metrics.json";
import rawPagos from "../../scripts/data/md22-pagos-calendar.json";

const tasks = md22Tasks as unknown as ScheduleTask[];
const payments: PaymentRow[] = (rawPagos as Array<{ fecha: string; pagado: number; avance: number }>).map((r) => ({
  fecha: r.fecha,
  pagadoPct: r.pagado,
  avancePct: r.avance,
}));

/**
 * Golden tests: the MD22 dataset, frozen with its real (extracted)
 * completion snapshot, at three dates. Expected values were computed by an
 * independent Python replica of the same formulas (docs/specs/backend.md
 * §2.2) run directly against the reference dashboard's own data — any drift
 * here means metrics.ts no longer matches what the client has been reading.
 */
describe("computeProgress — MD22 golden dataset", () => {
  const dates = Object.keys(expectedByDate) as Array<keyof typeof expectedByDate>;

  it.each(dates)("matches the reference at %s", (dateIso) => {
    const expected = expectedByDate[dateIso];
    const today = new Date(`${dateIso}T00:00:00`);
    const metrics = computeProgress({ tasks, payments }, today);

    expect(metrics.total).toBe(expected.total);
    expect(metrics.plannedCount).toBe(expected.plannedCount);
    expect(metrics.plannedPct).toBe(expected.plannedPct);
    expect(metrics.doneCount).toBe(expected.doneCount);
    expect(metrics.progressCount).toBe(expected.progressCount);
    expect(metrics.realPct).toBe(expected.realPct);
    expect(metrics.pagosAvancePct).toBe(expected.pagosAvancePct);
    expect(metrics.pagosPagadoPct).toBe(expected.pagosPagadoPct);
    expect(metrics.onTimePct).toBe(expected.onTimePct);
    expect(metrics.aheadPct).toBe(expected.aheadPct);
    expect(metrics.projectWeeks).toBeCloseTo(expected.projectWeeks, 3);
    expect(metrics.delayVsObra).toEqual(expected.delayVsObra);
    expect(metrics.delayVsPagos).toEqual(expected.delayVsPagos);
  });

  it.each(dates)("atrasadas count matches the reference at %s", (dateIso) => {
    const expected = expectedByDate[dateIso];
    const today = new Date(`${dateIso}T00:00:00`);
    const { atrasadas } = computeAlertas({ tasks }, today);
    expect(atrasadas.length).toBe(expected.atrasadasCount);
    expect(atrasadas.slice(0, 5).map((t) => t.stableKey)).toEqual(expected.atrasadasSample);
  });
});

describe("computeProgress — edge cases", () => {
  it("returns zeros for an empty task list", () => {
    const metrics = computeProgress({ tasks: [], payments: [] }, new Date("2026-01-01T00:00:00"));
    expect(metrics.total).toBe(0);
    expect(metrics.plannedPct).toBe(0);
    expect(metrics.realPct).toBe(0);
    expect(metrics.projectWeeks).toBe(0);
    expect(metrics.delayVsObra).toEqual({ kind: "onTime" });
  });
});
