// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { resetCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { PlanWeekData, Proposal } from "@/lib/types/calendario";
import type { PresentationStyle } from "@/lib/types/redesign";

import { PlanWeekBoard } from "./PlanWeekBoard";

const data: PlanWeekData = {
  weekStart: "2026-11-16",
  days: ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"],
  backlog: [{ taskId: "t1", title: "Ingenierías", projectName: "Madrid 22", hours: 2, priority: "alta" as never, managerId: "s1" }],
  people: [
    { staffId: "s1", name: "Ana", workday: 6, absent: [] },
    { staffId: "s2", name: "Luis", workday: 6, absent: ["2026-11-20"] },
  ],
  cells: [{ staffId: "s1", date: "2026-11-18", before: 3, after: 3, workday: 6 }],
};
const proposal = {
  id: "p1",
  line: "Planeé 1 tarea.",
  changes: [
    { changeId: "c1", type: "task_date", taskId: "t1", title: "Ingenierías", projectName: null, before: { date: null, field: "commitmentDate" }, after: { date: "2026-11-18" }, staffId: "s1" },
  ],
  deferred: [{ taskId: "t9", title: "Planos", reason: "Jorge ya está al 100 %" }],
} as unknown as Proposal;

function renderIn(style: PresentationStyle, props: Partial<React.ComponentProps<typeof PlanWeekBoard>> = {}) {
  return render(
    <StyleProvider style={style} scope="staff">
      <PlanWeekBoard data={data} viewerStaffId="s1" {...props} />
    </StyleProvider>,
  );
}

afterEach(() => {
  cleanup();
  resetCalendarioUi();
});

describe("PlanWeekBoard", () => {
  it("Visual: lanes with the plan dashed and the after value in the cell", () => {
    renderIn("visual", { proposal, checked: ["c1"] });
    expect(screen.getByRole("grid")).toBeTruthy();
    expect(screen.getByText("5/6")).toBeTruthy();
    expect(screen.getByText("Planos")).toBeTruthy();
    expect(screen.getByText(/Jorge ya está al 100 %/)).toBeTruthy();
    expect(screen.getByText("Ausente")).toBeTruthy();
  });

  it("Visual: the keyboard path and the drop call the same move", () => {
    const onMove = vi.fn();
    renderIn("visual", { onMove });
    fireEvent.click(screen.getByRole("button", { name: "Tomar Ingenierías" }));
    const cell = screen.getByRole("gridcell", { name: /Luis, miércoles 18/ });
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(onMove).toHaveBeenCalledWith("t1", "s2", "2026-11-18");
    expect(screen.getByRole("status").textContent).toContain("Moviste Ingenierías al miércoles 18");

    fireEvent.drop(cell, { dataTransfer: { getData: () => "t1" } });
    expect(onMove).toHaveBeenLastCalledWith("t1", "s2", "2026-11-18");
  });

  it("Esencial: day cards of the viewer and one plan button", () => {
    const onPlan = vi.fn();
    renderIn("esencial", { onPlan });
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.queryByText("Luis")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "✦ Planear mi semana" })[0]!);
    expect(onPlan).toHaveBeenCalled();
  });

  it("Analítico: person × day table and the checkbox proposal table", () => {
    const onToggle = vi.fn();
    renderIn("analitico", { proposal, checked: ["c1"], onToggle });
    expect(screen.getByRole("table", { name: "Horas por persona y día" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir Ingenierías" }));
    expect(onToggle).toHaveBeenCalledWith("c1");
  });

  it("collapses to the header row", () => {
    const onExpandedChange = vi.fn();
    renderIn("visual", { expanded: false, onExpandedChange });
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByText("1 por planear · 2 h")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Planear la semana/ }));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it("Aplicar and Cancelar", () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    renderIn("visual", { proposal, checked: ["c1"], onApply, onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onApply).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });
});
