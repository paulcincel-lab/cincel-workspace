import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CronogramaReport } from "./cronograma-report";
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

describe("CronogramaReport", () => {
  it("renders every section read-only against the real MD22 dataset", () => {
    render(<CronogramaReport data={data} asOf={new Date("2026-09-18T00:00:00")} />);

    expect(screen.getByText("Madrid 22")).toBeTruthy();
    expect(screen.getByText("CDMX")).toBeTruthy();
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

  it("expands adicionales accordion items by default (report mode)", () => {
    render(<CronogramaReport data={data} asOf={new Date("2026-09-18T00:00:00")} />);
    // With defaultOpen, the first item's content (a list entry) should already be visible without clicking.
    expect(screen.getByText(adicionales[0].items[0])).toBeTruthy();
  });
});
