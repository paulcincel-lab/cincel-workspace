import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { parseCalendarioQuery } from "@/lib/calendario/url-state";
import type { CalTaskItem } from "@/lib/types/calendario";

import { CalendarioEsencial } from "./CalendarioEsencial";

const TODAY = "2026-11-11";
function task(id: string, date: string, extra: Partial<CalTaskItem> = {}): CalTaskItem {
  return {
    kind: "task", id: `t:${id}`, taskId: id, title: `Tarea ${id}`, date, dateField: "commitmentDate",
    project: { id: "p", name: "Madrid 22" }, etapa: { id: "w", key: "diseno", name: "Diseño", colorSlot: 2 }, phase: null,
    status: "pendiente", statusLabel: "Pendiente", priority: "media", manager: null, support: [],
    overdue: false, completed: false, blocked: false, hours: 1, hoursSource: "default", parentTaskId: null, canEdit: true, ...extra,
  };
}
const query = (vista: string) => parseCalendarioQuery(`vista=${vista}&fecha=${TODAY}`, { today: TODAY });
const range = (items: CalTaskItem[]) => ({ ...emptyCalendarioRange({ from: "2026-11-09", to: "2026-11-15" }, TODAY), items });

describe("CalendarioEsencial", () => {
  it("renders Vencidas first, then Hoy, and hides empty groups", () => {
    render(
      <CalendarioEsencial
        range={range([task("1", TODAY), task("2", "2026-11-09", { overdue: true })])}
        query={query("semana")}
      />,
    );
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["Vencidas", "Hoy"]);
    expect(screen.queryByText("Mañana")).toBeNull();
    expect(screen.getByText("9 nov")).toBeTruthy();
  });

  it("completes a task from its ring and opens the detail from the title", () => {
    const onComplete = vi.fn();
    const onOpen = vi.fn();
    render(<CalendarioEsencial range={range([task("1", TODAY)])} query={query("dia")} onComplete={onComplete} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Completar Tarea 1" }));
    expect(onComplete).toHaveBeenCalledWith("1");
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tarea 1" }));
    expect(onOpen).toHaveBeenCalledWith("t:1");
  });

  it("disables the ring of a completed task", () => {
    render(<CalendarioEsencial range={range([task("1", TODAY, { completed: true, status: "completado" })])} query={query("dia")} onComplete={vi.fn()} />);
    const ring = screen.getByRole("button", { name: "Completada: Tarea 1" });
    expect((ring as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows Ver todas when Vencidas is capped", () => {
    const many = Array.from({ length: 22 }, (_, i) => task(`v${i}`, "2026-11-02", { overdue: true }));
    render(<CalendarioEsencial range={range(many)} query={query("mes")} />);
    const card = screen.getByRole("heading", { name: "Vencidas" }).closest("section") as HTMLElement;
    expect(within(card).getByRole("link", { name: "Ver todas" }).getAttribute("href")).toContain("estilo=analitico");
  });

  it("shows the empty state when nothing is left", () => {
    render(<CalendarioEsencial range={range([])} query={query("semana")} />);
    expect(screen.getByText("Tu agenda está libre.")).toBeTruthy();
  });
});
