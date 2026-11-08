// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/proyectos/p1/cronograma",
}));

const getProyectoCronogramaData = vi.fn();
const setTaskStatusAction = vi.fn();
const toggleTaskFlagAction = vi.fn();

vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectoCronogramaData: (...args: unknown[]) => getProyectoCronogramaData(...args),
}));

vi.mock("@/lib/actions/schedule-actions", () => ({
  setTaskStatusAction: (...args: unknown[]) => setTaskStatusAction(...args),
  toggleTaskFlagAction: (...args: unknown[]) => toggleTaskFlagAction(...args),
  addImprevistoAction: vi.fn(),
  deleteImprevistoAction: vi.fn(),
  previewImportScheduleAction: vi.fn(),
  commitImportScheduleAction: vi.fn(),
  importLegacyStateAction: vi.fn(),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import md22Tasks from "@/lib/cronograma/__fixtures__/md22-schedule-tasks.json";
import rawPagos from "@/scripts/data/md22-pagos-calendar.json";
import rawAdicionales from "@/scripts/data/md22-adicionales.json";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { Adicional, CronogramaData, PaymentRow, ScheduleTask } from "@/lib/types/schedule";

import CronogramaView from "./cronograma-view";
import { CronogramaReport } from "./cronograma-report";

const tasks = md22Tasks as unknown as ScheduleTask[];
const payments: PaymentRow[] = (rawPagos as Array<{ fecha: string; pagado: number; avance: number }>).map((r) => ({
  fecha: r.fecha,
  pagadoPct: r.pagado,
  avancePct: r.avance,
}));
const data: CronogramaData = {
  project: { id: "p1", name: "Madrid 22", address: "CDMX" },
  schedule: { id: "s1", version: 1, paymentCalendarLabel: null },
  tasks,
  payments,
  imprevistos: [],
  adicionales: rawAdicionales as Adicional[],
};
const cachedView = { data, today: "2026-09-18" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Renders over a cache that already holds the schedule, as after the page's prefetch. */
function renderSeeded(ui: ReactNode) {
  const client = createTestQueryClient();
  client.setQueryData(qk.proyectos.cronograma("p1"), cachedView);
  return renderWithQueryClient(<>{ui}</>, { client });
}

function renderTab(style: PresentationStyle, ui: ReactNode = <CronogramaView projectId="p1" contractEnd="2026-10-15" />) {
  return renderSeeded(
    <StyleProvider style={style} scope="staff">
      {ui}
    </StyleProvider>,
  );
}

describe("Proyecto · Cronograma tab", () => {
  it("Visual: the existing panels, unchanged, inside the new cards", () => {
    renderTab("visual");
    expect(screen.getByText("Cronograma general")).toBeTruthy();
    expect(screen.getByText("Avance del proyecto")).toBeTruthy();
    expect(screen.getByText(/Resumen 1/)).toBeTruthy();
    expect(screen.getByText("Adicionales de obra")).toBeTruthy();
    // Interactive behavior kept: the week boards still cycle task status.
    expect(screen.getAllByRole("button", { name: /^Estado:/ }).length).toBeGreaterThan(0);
  });

  it("Esencial: partidas and milestones as text, from the same schedule data", () => {
    renderTab("esencial");
    expect(screen.queryByText("Cronograma general")).toBeNull();
    expect(screen.getAllByText("Preliminares").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Entrega de obra/).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /^Estado:/ })).toHaveLength(0);
  });

  it("Analítico: one table with the schedule columns", () => {
    renderTab("analitico");
    expect(screen.queryByText("Cronograma general")).toBeNull();
    const tables = screen.getAllByRole("table");
    const schedule = tables.find((table) => within(table).queryByRole("columnheader", { name: "Holgura" }));
    expect(schedule).toBeTruthy();
    for (const name of ["Partida", "Responsable", "Inicio", "Fin", "Duración", "% real", "% plan", "Holgura"]) {
      expect(within(schedule as HTMLElement).getByRole("columnheader", { name })).toBeTruthy();
    }
    expect(within(schedule as HTMLElement).getAllByText("Preliminares").length).toBeGreaterThan(0);
  });

  it("never calls an action on render (the schedule comes from the cache)", () => {
    for (const style of ["visual", "esencial", "analitico"] as const) {
      renderTab(style);
      cleanup();
    }
    expect(getProyectoCronogramaData).not.toHaveBeenCalled();
    expect(setTaskStatusAction).not.toHaveBeenCalled();
    expect(toggleTaskFlagAction).not.toHaveBeenCalled();
  });
});

describe("Proyecto · Reporte (sheet)", () => {
  it("prints a token-styled sheet with a screen-only toolbar and no style switch", () => {
    const { container } = renderSeeded(<CronogramaReport projectId="p1" asOf="2026-09-18" />);
    expect(screen.getByRole("heading", { level: 1, name: "Reporte de avance" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Hoja del reporte" })).toBeTruthy();
    expect(screen.getAllByText("Corte al 18 sep 2026").length).toBeGreaterThan(0);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(container.querySelector("[data-print-root]")).toBeTruthy();
    // Toolbar is screen-only.
    const print = screen.getByRole("button", { name: "Imprimir" }).closest(".print\\:hidden");
    expect(print).toBeTruthy();
    // No weight above 600 in the sheet chrome.
    expect(container.querySelector("article header .font-bold")).toBeNull();
  });
});

describe("style guard (FE §18 item 15)", () => {
  const root = path.resolve(__dirname, "../..");
  const files = [
    "app/(staff)/proyectos/[id]/cronograma/page.tsx",
    "app/(staff)/proyectos/[id]/cronograma/reporte/page.tsx",
    "components/cronograma/cronograma-view.tsx",
    "components/cronograma/cronograma-report.tsx",
    "components/cronograma/report-toolbar.tsx",
  ];

  const read = (file: string) => readFileSync(path.join(root, file), "utf8");

  it.each(files)("%s neither imports StyleView nor branches on the style", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/StyleView/);
    expect(source).not.toMatch(/useStyle\(/);
  });

  it.each([
    "app/(staff)/proyectos/[id]/cronograma/reporte/page.tsx",
    "components/cronograma/cronograma-report.tsx",
    "components/cronograma/report-toolbar.tsx",
  ])("%s (report) has no style switch", (file) => {
    expect(read(file)).not.toMatch(/EstiloSwitch/);
  });

  it("the tab renders through CronogramaWidget, not a copy of cronograma-view", () => {
    expect(read("components/cronograma/cronograma-view.tsx")).toMatch(/<CronogramaWidget/);
    expect(read("app/(staff)/proyectos/[id]/cronograma/page.tsx")).toMatch(/<CronogramaView/);
  });
});
