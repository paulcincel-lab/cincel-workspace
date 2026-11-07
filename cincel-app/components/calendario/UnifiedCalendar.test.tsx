import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { CalendarEvent } from "@/lib/types/calendar";
import UnifiedCalendar from "./UnifiedCalendar";

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function event(overrides: Partial<Record<string, unknown>>): CalendarEvent {
  return {
    id: "e1",
    taskId: "t1",
    date: isoInDays(2),
    time: "09:00",
    title: "Planos ejecutivos",
    project: "Residencia Valle Alto",
    responsible: "Ana Ruiz",
    tramo: "diseno",
    tramoLabel: "Diseño",
    phaseId: "f1",
    phaseLabel: "Ejecutivo",
    type: "Compromiso",
    href: "/actividades/diseno",
    ...overrides,
  } as unknown as CalendarEvent;
}

describe("UnifiedCalendar tramo labels", () => {
  it("shows Tramo and Tarea columns and the Tramo / Fase filters", () => {
    render(<UnifiedCalendar mode="full" events={[event({})]} />);

    expect(screen.getByRole("columnheader", { name: /Tarea/ })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /Tramo/ })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /Etapa|Actividad/ })).toBeNull();

    expect(screen.getByText("Tramo: Todos")).toBeTruthy();
    expect(screen.getByText("Fase: Todas")).toBeTruthy();
    expect(screen.queryByText(/Etapa/)).toBeNull();

    // No tramo picked yet: the Fase filter is disabled.
    const fase = screen.getByRole("combobox", { name: "Fase" }) as HTMLButtonElement;
    expect(fase.disabled || fase.hasAttribute("data-disabled")).toBe(true);
    const tramo = screen.getByRole("combobox", { name: "Tramo" }) as HTMLButtonElement;
    expect(tramo.disabled).toBe(false);

    expect(screen.getAllByText("Diseño").length).toBeGreaterThan(0);
  });
});
