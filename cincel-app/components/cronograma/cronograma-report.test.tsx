import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

const getProyectoCronogramaData = vi.fn();
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectoCronogramaData: (...args: unknown[]) => getProyectoCronogramaData(...args),
}));
vi.mock("@/lib/actions/schedule-actions", () => ({
  addImprevistoAction: vi.fn(),
  deleteImprevistoAction: vi.fn(),
}));

import { CronogramaReport } from "./cronograma-report";
import type { ScheduleViewData } from "@/lib/actions/schedule-actions";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { settle } from "@/tests/helpers/settle";
import md22Tasks from "@/lib/cronograma/__fixtures__/md22-schedule-tasks.json";
import rawPagos from "@/scripts/data/md22-pagos-calendar.json";
import rawAdicionales from "@/scripts/data/md22-adicionales.json";
import type { Adicional, CronogramaData, PaymentRow, ScheduleTask } from "@/lib/types/schedule";

const tasks = md22Tasks as unknown as ScheduleTask[];
const payments: PaymentRow[] = (rawPagos as Array<{ fecha: string; pagado: number; avance: number }>).map((r) => ({
  fecha: r.fecha,
  pagadoPct: r.pagado,
  avancePct: r.avance,
}));
const adicionales = rawAdicionales as Adicional[];

const data: CronogramaData = {
  project: { id: "p1", name: "Madrid 22", address: "CDMX" },
  schedule: { id: "s1", version: 1, paymentCalendarLabel: "Calendario de Pagos Madrid 22 V1.4" },
  tasks,
  payments,
  imprevistos: [{ id: "i1", fecha: "2026-07-28", texto: "Trabajo imprevisto de ejemplo" }],
  adicionales,
};

/**
 * Renders the report over a cache holding `view`, as after the page's prefetch (or a visit to Cronograma), and waits
 * for the lazy charts and the ScrollArea measurements to settle.
 */
async function renderReport(asOf: string | null = "2026-09-18", view: ScheduleViewData | null = { data, today: "2026-10-01" }) {
  const client = createTestQueryClient();
  client.setQueryData(qk.proyectos.cronograma("p1"), view);
  const result = renderWithQueryClient(<CronogramaReport projectId="p1" asOf={asOf} />, { client });
  await settle(client);
  return result;
}

describe("CronogramaReport", () => {
  it("renders every section read-only against the real MD22 dataset", async () => {
    await renderReport();

    const sheet = within(screen.getByRole("article", { name: "Hoja del reporte" }));
    expect(sheet.getByText("Madrid 22")).toBeTruthy();
    expect(sheet.getByText("CDMX")).toBeTruthy();
    expect(screen.getByText("Cronograma general")).toBeTruthy();
    expect(screen.getByText("Avance del proyecto")).toBeTruthy();
    expect(screen.getByText(/Resumen 1/)).toBeTruthy();
    expect(screen.getByText(/Resumen 2/)).toBeTruthy();
    expect(screen.getByText("Alertas")).toBeTruthy();
    expect(screen.getByText("Trabajos realizados imprevistos")).toBeTruthy();
    expect(screen.getByText("Adicionales de obra")).toBeTruthy();

    // Read-only: no interactive status/flag controls, no delete buttons, no add form.
    expect(screen.queryAllByRole("button", { name: /clic para marcar/ })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Agregar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
  });

  it("expands adicionales accordion items by default (report mode)", async () => {
    await renderReport();
    // With defaultOpen, the first item's content (a list entry) should already be visible without clicking.
    expect(screen.getByText(adicionales[0].items[0])).toBeTruthy();
  });

  it("reads the cached schedule: no action call", async () => {
    await renderReport();
    expect(getProyectoCronogramaData).not.toHaveBeenCalled();
  });

  it("cuts at ?asOf=", async () => {
    await renderReport("2026-09-18");
    expect(screen.getAllByText("Corte al 18 sep 2026").length).toBeGreaterThan(0);
  });

  it("falls back to the schedule's today", async () => {
    await renderReport("not-a-date");
    expect(screen.getAllByText("Corte al 1 oct 2026").length).toBeGreaterThan(0);
  });

  it("shows the no-schedule message for a null schedule", async () => {
    await renderReport("2026-09-18", null);
    expect(screen.getByText(/todavía no tiene un cronograma importado, o no tienes acceso/)).toBeTruthy();
  });
});
