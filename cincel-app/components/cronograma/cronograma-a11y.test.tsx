// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import axe from "axe-core";

import { ProgressDonut } from "./progress-donut";
import { SCurveChart } from "./s-curve-chart";
import { computeProgress } from "@/lib/cronograma/metrics";
import md22Tasks from "../../lib/cronograma/__fixtures__/md22-schedule-tasks.json";
import rawPagos from "../../scripts/data/md22-pagos-calendar.json";
import type { PaymentRow, ScheduleTask } from "@/lib/types/schedule";

const tasks = md22Tasks as unknown as ScheduleTask[];
const payments: PaymentRow[] = (rawPagos as Array<{ fecha: string; pagado: number; avance: number }>).map((r) => ({
  fecha: r.fecha,
  pagadoPct: r.pagado,
  avancePct: r.avance,
}));
const today = new Date("2026-09-18T00:00:00");

async function criticalViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

describe("cronograma charts accessibility", () => {
  it("ProgressDonut exposes its values as text and has no serious axe violations", async () => {
    const metrics = computeProgress({ tasks, payments }, today);
    const { container, getByRole } = render(<ProgressDonut metrics={metrics} />);
    expect(getByRole("img").getAttribute("aria-label")).toContain(`real ${metrics.realPct}%`);
    expect(container.textContent).toContain(`${metrics.realPct}%`);
    expect(await criticalViolations(container)).toEqual([]);
  });

  it("SCurveChart labels the chart with its end values and has no serious axe violations", async () => {
    const { container, getByRole } = render(<SCurveChart tasks={tasks} payments={payments} today={today} />);
    expect(getByRole("img").getAttribute("aria-label")).toMatch(/planeado \d+%/);
    expect(await criticalViolations(container)).toEqual([]);
  });
});
