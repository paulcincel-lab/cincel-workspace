// @vitest-environment happy-dom
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// QuickAddRow reads the org time zone; keep the settings query off the network.
vi.mock("@/lib/settings/use-general-settings", async () => {
  const { GENERAL_SETTINGS_DEFAULTS } = await import("@/lib/settings/general-settings");
  return { useGeneralSettings: () => GENERAL_SETTINGS_DEFAULTS };
});

import { EsencialCard } from "@/components/widgets/EsencialCard";
import { EsencialItemRow } from "@/components/widgets/EsencialItemRow";
import { FilterCard } from "@/components/widgets/FilterCard";
import { GroupedTable, type Group } from "@/components/widgets/GroupedTable";
import { KpiStrip } from "@/components/widgets/KpiStrip";
import { PageHeader, type PageHeaderProps } from "@/components/widgets/PageHeader";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { QuickAddRow, type QuickAddRowProps } from "@/components/widgets/QuickAddRow";
import { ToolSteps } from "@/components/widgets/ToolSteps";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import { parseQuickAdd, type QuickAddParseContext } from "@/lib/quick-add/parse";

const CTX: QuickAddParseContext = { today: "2026-11-09", people: [], etapas: [], meId: null };

type Row = { name: string; hours: number };

afterEach(cleanup);

describe("Estilos contracts", () => {
  it("every Estilos stub renders with minimal props", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const renders = [
      () => render(<PageStyleLayout visual={() => <p>v</p>} esencial={() => <p>e</p>} analitico={() => <p>a</p>} />),
      () => render(<PageHeader title="Tareas" />),
      () => render(<PageHeader title="Tareas" estilo={false} actions={<button type="button">Nueva</button>} />),
      () => render(<GroupedTable<Row> label="Horas" columns={[]} groups={[]} />),
      () =>
        render(
          <GroupedTable<Row>
            label="Horas"
            columns={[
              { key: "name", label: "Nombre" },
              { key: "hours", label: "Horas", format: "hours" },
            ]}
            groups={[
              {
                id: "g1",
                label: "Grupo 1",
                metrics: [{ key: "m", value: "3" }],
                children: [{ id: "g1a", label: "Subgrupo", metrics: [], rows: [{ name: "Ana", hours: 4 }] }],
              },
            ]}
          />,
        ),
      () => render(<KpiStrip items={[]} />),
      () => render(<KpiStrip items={[{ key: "k", label: "Abiertas", value: 12 }]} />),
      () => render(<FilterCard groups={[]} onChange={() => {}} />),
      () => render(<EsencialCard title="Hoy">{null}</EsencialCard>),
      () => render(<EsencialItemRow title="Revisar planos" status={null} />),
      () =>
        render(
          <EsencialItemRow
            title="Revisar planos"
            meta={[{ key: "p", label: "Proyecto A" }]}
            status={{ kind: "task", value: { status: "pendiente", customStatus: null } }}
          />,
        ),
      () =>
        renderWithQueryClient(
          <table>
            <tbody>
              <QuickAddRow context={{ label: "Nueva tarea", projectId: null }} onCreate={vi.fn()} variant="row" />
            </tbody>
          </table>,
        ),
      () => render(<ToolSteps parts={[]} />),
    ];
    for (const run of renders) {
      expect(run).not.toThrow();
      cleanup();
    }
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("GroupedTable renders one section per top group with its leaf rows", () => {
    render(
      <GroupedTable<Row>
        label="Horas"
        columns={[{ key: "name", label: "Nombre" }]}
        groups={[
          {
            id: "g1",
            label: "Grupo 1",
            metrics: [],
            rows: [{ name: "Ana", hours: 1 }],
            children: [{ id: "g1a", label: "Subgrupo", metrics: [], rows: [{ name: "Luis", hours: 2 }] }],
          },
        ]}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Nombre" })).toBeTruthy();
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("Luis")).toBeTruthy();
  });

  it("FilterCard calls onChange with the group and option", () => {
    const onChange = vi.fn();
    render(
      <FilterCard
        groups={[{ id: "estado", label: "Estado", value: "todas", options: [{ value: "todas", label: "Todas" }, { value: "vencidas", label: "Vencidas" }] }]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("region", { name: "Filtros" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Vencidas" }));
    expect(onChange).toHaveBeenCalledWith("estado", "vencidas");
  });

  it("QuickAddRow calls onCreate with the parsed title on Enter", async () => {
    const onCreate = vi.fn(async () => ({ id: "t1", title: "Revisar" }));
    renderWithQueryClient(<QuickAddRow context={{ label: "Nueva tarea", projectId: "p1" }} onCreate={onCreate} variant="card" />);
    const input = screen.getByLabelText("Nueva tarea en Nueva tarea");
    fireEvent.change(input, { target: { value: "  Revisar  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreate).toHaveBeenCalledWith({
      title: "Revisar",
      projectId: "p1",
      etapaId: null,
      assigneeId: null,
      dueDate: null,
      priority: "media",
    });
    await screen.findByText("Creada: Revisar");
  });

  it("ToolSteps lists one step per tool part", () => {
    const parts = [
      { type: "text", text: "Hola" },
      { type: "tool-listTasks", toolCallId: "c1", state: "output-available", input: {}, output: {} },
      { type: "dynamic-tool", toolName: "buscar", toolCallId: "c2", state: "input-available", input: {} },
    ] as unknown as UIMessage["parts"];
    render(<ToolSteps parts={parts} />);
    const list = screen.getByRole("list", { name: "Pasos del asistente" });
    const items = [...list.querySelectorAll(":scope > li")].map((li) => li.textContent ?? "");
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("listTasks");
    expect(items[1]).toContain("buscar");
  });

  it("parseQuickAdd returns the trimmed text as title", () => {
    expect(parseQuickAdd("  Revisar planos  ", CTX)).toEqual({ title: "Revisar planos", tokens: [], slash: null });
  });

  it("types match the contract", () => {
    expectTypeOf<{ id: string; label: string; metrics: []; children: [{ id: string; label: string; metrics: []; rows: Row[] }] }>().toMatchTypeOf<
      Group<Row>
    >();
    expectTypeOf<QuickAddRowProps["variant"]>().toEqualTypeOf<"row" | "card" | "column">();
    expectTypeOf<{ title: string; estilo: boolean }>().toMatchTypeOf<PageHeaderProps>();
  });
});
