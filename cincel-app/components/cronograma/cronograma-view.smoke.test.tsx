// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/layout/Header", () => ({ default: () => <div data-testid="header" /> }));
vi.mock("@/components/layout/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));

import { GanttChart } from "./gantt-chart";
import { ProgressDonut } from "./progress-donut";
import { SCurveChart } from "./s-curve-chart";
import { WeekBoards } from "./week-boards";
import { AlertasPanel } from "./alertas-panel";
import { ResumenCards } from "./resumen-cards";
import { AdicionalesPanel } from "./adicionales-panel";
import { computeProgress } from "@/lib/cronograma/metrics";
import md22Tasks from "../../lib/cronograma/__fixtures__/md22-schedule-tasks.json";
import rawPagos from "../../scripts/data/md22-pagos-calendar.json";
import rawAdicionales from "../../scripts/data/md22-adicionales.json";
import type { Adicional, PaymentRow, ScheduleTask } from "@/lib/types/schedule";

const tasks = md22Tasks as unknown as ScheduleTask[];
const payments: PaymentRow[] = (rawPagos as Array<{ fecha: string; pagado: number; avance: number }>).map((r) => ({
  fecha: r.fecha,
  pagadoPct: r.pagado,
  avancePct: r.avance,
}));
const adicionales = rawAdicionales as Adicional[];
const today = new Date("2026-09-18T00:00:00");

/**
 * Renders every Phase 2 display component against the real, seeded MD22
 * dataset (not a hand-picked toy fixture) — catches runtime errors (null
 * derefs, bad SVG geometry, missing props) that tsc can't, since local
 * browser verification hit unrelated environment friction (see PR
 * description) and couldn't confirm this directly.
 */
describe("Cronograma Phase 2 components — smoke render against real MD22 data", () => {
  it("GanttChart renders all known secciones", () => {
    render(<GanttChart tasks={tasks} today={today} />);
    expect(screen.getByText("Cronograma general")).toBeTruthy();
    expect(screen.getByText("Preliminares")).toBeTruthy();
    expect(screen.getByText("Cancelerías y herrerías")).toBeTruthy();
  });

  it("ProgressDonut renders computed percentages", () => {
    const metrics = computeProgress({ tasks, payments }, today);
    render(<ProgressDonut metrics={metrics} />);
    expect(screen.getAllByText(`${metrics.realPct}%`).length).toBeGreaterThan(0);
  });

  it("SCurveChart renders without throwing", () => {
    const { container } = render(<SCurveChart tasks={tasks} payments={payments} today={today} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("WeekBoards renders three columns with the HOY badge on the current week", () => {
    render(<WeekBoards tasks={tasks} today={today} weekOffset={0} />);
    expect(screen.getByText("Semana anterior")).toBeTruthy();
    expect(screen.getByText("Esta semana")).toBeTruthy();
    expect(screen.getByText("Próxima semana")).toBeTruthy();
    expect(screen.getByText("Hoy")).toBeTruthy();
  });

  it("AlertasPanel renders atrasadas and atención especial sections", () => {
    render(<AlertasPanel tasks={tasks} today={today} />);
    expect(screen.getByText(/Tareas atrasadas/)).toBeTruthy();
    expect(screen.getByText(/Atención especial/)).toBeTruthy();
  });

  it("ResumenCards renders both summary cards", () => {
    const metrics = computeProgress({ tasks, payments }, today);
    render(<ResumenCards metrics={metrics} />);
    expect(screen.getByText(/Resumen 1/)).toBeTruthy();
    expect(screen.getByText(/Resumen 2/)).toBeTruthy();
  });

  it("AdicionalesPanel renders every partida group", () => {
    render(<AdicionalesPanel adicionales={adicionales} />);
    expect(screen.getByText("Adicionales de obra")).toBeTruthy();
    for (const a of adicionales) {
      expect(screen.getByText(a.partida)).toBeTruthy();
    }
  });
});
