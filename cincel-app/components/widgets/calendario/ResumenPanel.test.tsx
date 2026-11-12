import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyDaySummary, emptyWeekSummary } from "@/lib/calendario/empty";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { DaySummary, SummaryTile, WeekSummary } from "@/lib/types/calendario";

import { ResumenPanel } from "./ResumenPanel";

const tiles: SummaryTile[] = [
  { key: "reuniones", label: "Reuniones", count: 1, items: [{ id: "a", title: "Revisión", line: "10:00", action: { kind: "prepare", eventId: "e1", label: "Prepárame", tool: "meeting_prep" } }] },
  { key: "vence", label: "Vence hoy", count: 0, items: [] },
  { key: "riesgo", label: "En riesgo", count: 2, items: [{ id: "b", title: "Planos", line: "Proyecto Beta", action: { kind: "propose_date", taskId: "t1", label: "Propón fecha", tool: "move_tasks" } }] },
  { key: "bloqueas", label: "Bloqueas a otros", count: 0, items: [] },
];
const day: DaySummary = { ...emptyDaySummary("2026-11-11"), greeting: "Buenos días, Oscar", lead: "Tienes una reunión.", tiles };
const week: WeekSummary = {
  ...emptyWeekSummary("2026-11-09"),
  greeting: "Buenos días, Oscar",
  lead: "Semana cargada.",
  tiles,
  overloadedDays: [{ date: "2026-11-12", hours: 9, workday: 6 }],
};

describe("ResumenPanel", () => {
  beforeEach(() => useCalendarioUi.getState().reset());

  for (const variant of ["visual", "esencial", "analitico"] as const) {
    it(`${variant}: shows counts and the day primary action`, () => {
      const onAction = vi.fn();
      render(<ResumenPanel summary={day} variant={variant} onAction={onAction} />);
      expect(screen.getAllByText("Reuniones").length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole("button", { name: "✦ Pasa a mañana lo que no alcances hoy" }));
      expect(onAction).toHaveBeenCalledWith(day.primary);
    });
  }

  it("expands a tile with aria-expanded and runs the item action", () => {
    const onAction = vi.fn();
    render(<ResumenPanel summary={day} variant="visual" onAction={onAction} />);
    const tile = screen.getByRole("button", { name: /Reuniones/ });
    expect(tile.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(tile);
    expect(tile.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Prepárame/ }));
    expect(onAction).toHaveBeenCalledWith(tiles[0]!.items[0]!.action);
  });

  it("marks risk count in destructive ink", () => {
    render(<ResumenPanel summary={day} variant="visual" />);
    expect(screen.getByText("2").className).toContain("text-destructive-ink");
  });

  it("collapses and restores", () => {
    render(<ResumenPanel summary={day} />);
    fireEvent.click(screen.getByRole("button", { name: "Ocultar resumen" }));
    expect(useCalendarioUi.getState().resumenCollapsed).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Mostrar resumen" }));
    expect(screen.getByText("Buenos días, Oscar")).toBeTruthy();
  });

  it("week: hides Planea mi semana without the handler, shows it with, and offers Reparte el jueves", () => {
    const onAction = vi.fn();
    const onPlanWeek = vi.fn();
    const { rerender } = render(<ResumenPanel summary={week} onAction={onAction} />);
    expect(screen.queryByRole("button", { name: "✦ Planea mi semana" })).toBeNull();
    rerender(<ResumenPanel summary={week} onAction={onAction} onPlanWeek={onPlanWeek} />);
    fireEvent.click(screen.getByRole("button", { name: "✦ Planea mi semana" }));
    expect(onPlanWeek).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "✦ Reparte el jueves" }));
    expect(onAction).toHaveBeenCalledWith({ kind: "redistribute", date: "2026-11-12", label: "Reparte esto", tool: "propose_redistribution" });
  });
});
