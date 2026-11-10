// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ListIcon } from "lucide-react";

import { ToolStepsTable } from "@/components/widgets/asistente/ToolStepsTable";
import type { ToolStep, ToolStepGroup } from "@/lib/assistant/tool-steps";

afterEach(cleanup);

function step(overrides: Partial<ToolStep>): ToolStep {
  return {
    toolCallId: "c",
    toolName: "list_activities_due",
    state: "done",
    label: "Buscó tareas",
    short: "Tareas vencidas del proyecto",
    running: "Buscando tareas por vencer…",
    icon: ListIcon,
    tone: 1,
    params: [],
    rows: null,
    durationMs: null,
    ...overrides,
  };
}

function bodyRows(): HTMLElement[] {
  const table = screen.getByRole("table", { name: "Pasos del asistente" });
  return within(table).getAllByRole("row").slice(1);
}

describe("ToolStepsTable", () => {
  it("one row per step, approval group as tool × n", () => {
    const groups: ToolStepGroup[] = [
      {
        kind: "steps",
        totalMs: 400,
        steps: [
          step({
            toolCallId: "s1",
            params: [
              { key: "proyecto", value: "Oficina Polanco" },
              { key: "estado", value: "vencidas" },
            ],
            rows: 12,
            durationMs: 400,
          }),
          step({ toolCallId: "s2", toolName: "team_workload_summary", short: "Carga del equipo", rows: 8, durationMs: 300 }),
        ],
      },
      {
        kind: "approval",
        toolName: "create_task",
        steps: [1, 2, 3, 4].map((n) =>
          step({ toolCallId: `w${n}`, toolName: "create_task", short: "Crear tarea", state: "needs-confirmation", approvalId: `p${n}` }),
        ),
        preview: [1, 2, 3, 4].map((n) => ({ op: "+" as const, title: `Revisión ${n}` })),
      },
    ];
    render(<ToolStepsTable groups={groups} />);
    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    const cells = (row: HTMLElement) => within(row).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells(rows[0]!)).toEqual([
      "1",
      "list_activities_due",
      "Tareas vencidas del proyecto",
      "proyecto=Oficina Polanco · estado=vencidas",
      "✓ Listo",
      "0.4 s",
      "12",
    ]);
    expect(cells(rows[1]!)[1]).toBe("team_workload_summary");
    expect(cells(rows[2]!).slice(0, 3)).toEqual(["3", "create_task × 4", "Crear tarea"]);
    expect(cells(rows[2]!)[6]).toBe("4");
  });

  it("state cells per state", () => {
    const states: ToolStep["state"][] = ["done", "needs-confirmation", "error", "denied", "running", "confirmed"];
    render(
      <ToolStepsTable
        groups={[
          {
            kind: "steps",
            totalMs: null,
            steps: states.map((state, i) =>
              step({ toolCallId: `s${i}`, state, errorText: state === "error" ? "No existe el proyecto." : undefined }),
            ),
          },
        ]}
      />,
    );
    const rows = bodyRows();
    const estado = (i: number) => within(rows[i]!).getAllByRole("cell")[4]!.textContent;
    expect(estado(0)).toBe("✓ Listo");
    expect(estado(1)).toBe("● Requiere confirmación");
    expect(rows[1]!.getAttribute("data-state")).toBe("needs-confirmation");
    expect(estado(2)).toContain("✕ Error");
    // The error message is reachable without hovering.
    expect(within(rows[2]!).getByRole("button").textContent).toContain("No existe el proyecto.");
    expect(estado(3)).toBe("Cancelado");
    expect(estado(4)).toBe("En curso");
    expect(estado(5)).toBe("En curso");
  });

  it("duration dash without metadata", () => {
    render(
      <ToolStepsTable groups={[{ kind: "steps", totalMs: null, steps: [step({ toolCallId: "s1", durationMs: null, rows: null })] }]} />,
    );
    const cells = within(bodyRows()[0]!).getAllByRole("cell");
    expect(cells[5]!.textContent).toBe("—");
    expect(cells[6]!.textContent).toBe("—");
    expect(cells[3]!.textContent).toBe("—");
  });
});
