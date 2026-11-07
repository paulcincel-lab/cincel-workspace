import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { CalendarEvent } from "@/lib/types/calendar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams("vista=calendario"),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({ deleteTaskAction: vi.fn(() => Promise.resolve()) }));

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

describe("UnifiedCalendar event detail popover", () => {
  it("keeps the event links when eventDetails is off (legacy)", () => {
    render(<UnifiedCalendar mode="full" events={[event({ date: isoInDays(0) })]} />);
    const links = screen.getAllByRole("link", { name: /Planos ejecutivos/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute("href")).toBe("/actividades/diseno");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens EventDetailPopover on event click when eventDetails is on", async () => {
    render(<UnifiedCalendar mode="full" eventDetails events={[event({ date: isoInDays(0) })]} />);
    fireEvent.click(screen.getAllByRole("link", { name: /Planos ejecutivos/ })[0]);
    expect(await screen.findByRole("dialog", { name: "Planos ejecutivos" })).toBeTruthy();
  });
});
