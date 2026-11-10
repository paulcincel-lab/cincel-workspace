// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import {
  COLLAPSE_ALL_LABEL,
  EXPAND_ALL_LABEL,
  GroupedTable,
  groupAnchorId,
  type Group,
  type GroupedTableProps,
} from "@/components/widgets/GroupedTable";
import {
  groupedTaskAnchors,
  groupedTaskColumns,
  groupedTaskGroups,
  groupedTaskHeat,
  groupedTaskTotals,
  type GroupedTaskRow,
} from "@/components/widgets/fixtures/grouped-table";
import type { RecordColumn } from "@/lib/types/widgets";

afterEach(cleanup);

type Row = GroupedTaskRow;

function renderTable(props: Partial<GroupedTableProps<Row>> = {}) {
  return render(
    <GroupedTable<Row>
      label="Tareas"
      columns={groupedTaskColumns}
      groups={groupedTaskGroups}
      heat={groupedTaskHeat}
      totals={groupedTaskTotals}
      anchors={groupedTaskAnchors}
      anchorsCaption="tareas vencidas por proyecto"
      {...props}
    />,
  );
}

function header(name: RegExp) {
  return screen.getByRole("button", { name });
}

function cell(rowTitle: string, column: string): HTMLElement {
  const row = screen.getByText(rowTitle).closest("tr");
  if (!row) throw new Error(`row ${rowTitle} not found`);
  const td = row.querySelector<HTMLElement>(`td[data-column="${column}"]`);
  if (!td) throw new Error(`cell ${column} not found`);
  return td;
}

describe("GroupedTable", () => {
  it("renders project and tramo groups with captions and metrics", () => {
    renderTable();
    const lomas = screen.getByRole("region", { name: "Casa Lomas" });
    const top = within(lomas).getByRole("button", { name: /^Casa Lomas/ });
    expect(top.getAttribute("aria-expanded")).toBe("true");
    expect(top.textContent).toContain("8 tareas · 2 tramos");
    expect(top.textContent).toContain("57 % vencidas");
    expect(top.querySelector("b")?.className).not.toContain("font-bold");
    const diseno = within(lomas).getByRole("button", { name: /^Diseño/ });
    expect(diseno.textContent).toContain("3 tareas");
    expect(diseno.textContent).toContain("3 abiertas · 2 vencidas · 15 d · 1 bloqueada");
    expect(within(diseno).getByText("2 vencidas").className).toContain("text-destructive");
    expect(screen.getByRole("table", { name: "Tareas · Casa Lomas" })).toBeTruthy();
    expect(screen.getByText("Planos arquitectónicos")).toBeTruthy();
    expect(screen.getByText(groupedTaskTotals.summary)).toBeTruthy();
  });

  it("numbers are mono and right-aligned; headers are mono uppercase", () => {
    renderTable();
    const td = cell("Planos arquitectónicos", "diasRetraso");
    expect(td.className).toContain("font-mono");
    expect(td.className).toContain("text-right");
    expect(td.textContent).toBe("7 d");
    expect(cell("Planos arquitectónicos", "vence").className).toContain("font-mono");
    const th = within(screen.getByRole("table", { name: "Tareas · Casa Lomas" })).getByRole("columnheader", { name: "Días de retraso" });
    expect(th.className).toContain("font-mono");
    expect(th.className).toContain("uppercase");
    expect(th.className).toContain("text-[11px]");
    expect(th.className).toContain("text-right");
  });

  it("collapses a second-level group to its row", () => {
    renderTable();
    const diseno = header(/^Diseño/);
    fireEvent.click(diseno);
    expect(diseno.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Planos arquitectónicos")).toBeNull();
    expect(screen.getByText("Cimentación")).toBeTruthy();
    expect(header(/^Diseño/)).toBeTruthy();
  });

  it("Expandir todo and Contraer todo", () => {
    renderTable({ defaultExpanded: false });
    expect(screen.queryByText("Cimentación")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: EXPAND_ALL_LABEL }));
    expect(screen.getByText("Cimentación")).toBeTruthy();
    expect(screen.getByText("Cortinas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: COLLAPSE_ALL_LABEL }));
    expect(screen.queryByText("Cimentación")).toBeNull();
    expect(header(/^Casa Lomas/).getAttribute("aria-expanded")).toBe("false");
  });

  it("controlled expanded calls onExpandedChange", () => {
    const onExpandedChange = vi.fn();
    const { rerender } = renderTable({ expanded: ["casa-lomas"], onExpandedChange });
    expect(header(/^Casa Lomas/).getAttribute("aria-expanded")).toBe("true");
    expect(header(/^Diseño/).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(header(/^Diseño/));
    expect(onExpandedChange).toHaveBeenLastCalledWith(["casa-lomas", "casa-lomas/diseno"]);
    // Controlled: nothing changes until the parent passes the new list.
    expect(header(/^Diseño/).getAttribute("aria-expanded")).toBe("false");
    rerender(
      <GroupedTable<Row>
        label="Tareas"
        columns={groupedTaskColumns}
        groups={groupedTaskGroups}
        expanded={["casa-lomas", "casa-lomas/diseno"]}
        onExpandedChange={onExpandedChange}
      />,
    );
    expect(header(/^Diseño/).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(header(/^Casa Lomas/));
    expect(onExpandedChange).toHaveBeenLastCalledWith(["casa-lomas/diseno"]);
    fireEvent.click(screen.getByRole("button", { name: EXPAND_ALL_LABEL }));
    expect(onExpandedChange).toHaveBeenLastCalledWith([
      "casa-lomas",
      "casa-lomas/diseno",
      "casa-lomas/construccion",
      "depto-roma",
      "depto-roma/decoracion",
    ]);
  });

  it("onGroupExpand fires when rows are undefined", () => {
    const onGroupExpand = vi.fn();
    const groups: Group<Row>[] = [{ id: "lazy", label: "Proyecto diferido", metrics: [] }];
    const { container } = render(
      <GroupedTable<Row> label="Tareas" columns={groupedTaskColumns} groups={groups} defaultExpanded={false} onGroupExpand={onGroupExpand} />,
    );
    expect(onGroupExpand).not.toHaveBeenCalled();
    fireEvent.click(header(/^Proyecto diferido/));
    expect(onGroupExpand).toHaveBeenCalledWith("lazy");
    expect(container.querySelector('[data-slot="group-loading"]')).not.toBeNull();
  });

  it("onGroupExpand fires once for a group open from the start without rows", () => {
    const onGroupExpand = vi.fn();
    render(
      <GroupedTable<Row>
        label="Tareas"
        columns={groupedTaskColumns}
        groups={[{ id: "lazy", label: "Proyecto diferido", metrics: [] }]}
        onGroupExpand={onGroupExpand}
      />,
    );
    expect(onGroupExpand).toHaveBeenCalledTimes(1);
    expect(onGroupExpand).toHaveBeenCalledWith("lazy");
  });

  it("auto footer sums and averages", () => {
    const columns: RecordColumn[] = [
      { key: "tarea", label: "Tarea" },
      { key: "horas", label: "Horas", format: "hours" },
      { key: "pct", label: "%", format: "percent" },
    ];
    const groups: Group<Record<string, unknown>>[] = [
      {
        id: "p1",
        label: "Proyecto",
        metrics: [],
        footer: "auto",
        children: [
          { id: "a", label: "A", metrics: [], rows: [{ id: "1", tarea: "Uno", horas: 2, pct: 40 }] },
          {
            id: "b",
            label: "B",
            metrics: [],
            rows: [
              { id: "2", tarea: "Dos", horas: 3, pct: 60 },
              { id: "3", tarea: "Tres", horas: 5, pct: 80 },
            ],
          },
        ],
      },
      { id: "p2", label: "Otro", metrics: [], rows: [{ id: "4", tarea: "Cuatro", horas: 1, pct: 0 }], footer: { tarea: "Total manual", horas: "—" } },
    ];
    const { container } = render(<GroupedTable label="Horas" columns={columns} groups={groups} />);
    const footers = container.querySelectorAll('[data-slot="group-footer"]');
    const first = footers[0];
    expect(first.querySelector('[data-column="tarea"]')?.textContent).toBe("Total · 3 tareas");
    expect(first.querySelector('[data-column="horas"]')?.textContent).toBe("10 h");
    expect(first.querySelector('[data-column="pct"]')?.textContent).toBe("60%");
    const second = footers[1];
    expect(second.querySelector('[data-column="tarea"]')?.textContent).toBe("Total manual");
    expect(second.querySelector('[data-column="horas"]')?.textContent).toBe("—");
    expect(second.querySelector('[data-column="pct"]')?.textContent).toBe("0%");
  });

  it("heat warn and crit above", () => {
    renderTable();
    expect(cell("Cimentación", "diasRetraso").getAttribute("data-heat")).toBeNull();
    expect(cell("Planos arquitectónicos", "diasRetraso").getAttribute("data-heat")).toBe("warn");
    expect(cell("Render de fachada", "diasRetraso").getAttribute("data-heat")).toBe("crit");
    expect(cell("Render de fachada", "diasRetraso").className).toContain("bg-tint-destructive");
    expect(cell("Planos arquitectónicos", "pctVencidas").getAttribute("data-heat")).toBe("warn");
    expect(cell("Render de fachada", "pctVencidas").getAttribute("data-heat")).toBe("crit");
    expect(cell("Paleta de materiales", "pctVencidas").getAttribute("data-heat")).toBeNull();
  });

  it("heat below for plan deviation", () => {
    const columns: RecordColumn[] = [
      { key: "proyecto", label: "Proyecto" },
      { key: "desvPlan", label: "Desv. vs plan", format: "delta" },
    ];
    const rows = [
      { id: "a", proyecto: "Alfa", desvPlan: -3 },
      { id: "b", proyecto: "Beta", desvPlan: -4 },
      { id: "c", proyecto: "Gama", desvPlan: -5 },
      { id: "d", proyecto: "Delta", desvPlan: -7 },
      { id: "e", proyecto: "Épsilon", desvPlan: -8 },
    ];
    render(
      <GroupedTable
        label="Proyectos"
        columns={columns}
        groups={[{ id: "todos", label: "Todos", metrics: [], rows }]}
        heat={[{ key: "desvPlan", warnAt: -4, critAt: -7, direction: "below" }]}
      />,
    );
    expect(cell("Alfa", "desvPlan").getAttribute("data-heat")).toBeNull();
    expect(cell("Beta", "desvPlan").getAttribute("data-heat")).toBeNull();
    expect(cell("Gama", "desvPlan").getAttribute("data-heat")).toBe("warn");
    expect(cell("Delta", "desvPlan").getAttribute("data-heat")).toBe("warn");
    expect(cell("Épsilon", "desvPlan").getAttribute("data-heat")).toBe("crit");
  });

  it("marks new rows with row-new and Nueva", () => {
    renderTable({ isRowNew: (row) => row.id === "t5", rowHref: (row) => `/tareas/${row.id}`, isRowMuted: (row) => row.estatus === "Completado" });
    const row = screen.getByText("Muros planta baja").closest("tr");
    expect(row?.className).toContain("row-new");
    expect(within(row as HTMLElement).getByText("Nueva")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Muros planta baja" }).getAttribute("href")).toBe("/tareas/t5");
    expect(screen.getByRole("link", { name: "Losa" }).className).toContain("text-muted-foreground");
    expect(screen.getByText("Cimentación").closest("tr")?.className).not.toContain("row-new");
  });

  it("renders quickAdd as the last row of a leaf group", () => {
    const groups: Group<Row>[] = [
      {
        id: "p",
        label: "Proyecto",
        metrics: [],
        children: [
          {
            id: "p/t",
            label: "Tramo",
            metrics: [],
            rows: [groupedTaskGroups[0].children![0].rows![0]],
            quickAdd: (
              <tr data-testid="quick-add">
                <td colSpan={groupedTaskColumns.length}>Nueva tarea</td>
              </tr>
            ),
          },
        ],
      },
    ];
    render(<GroupedTable<Row> label="Tareas" columns={groupedTaskColumns} groups={groups} />);
    const quickAdd = screen.getByTestId("quick-add");
    const body = quickAdd.closest("tbody");
    expect(body?.lastElementChild).toBe(quickAdd);
    expect(body?.querySelectorAll("tr").length).toBe(2);
  });

  it("Cargar más calls onLoadMore", () => {
    const onLoadMore = vi.fn();
    const groups: Group<Row>[] = [{ id: "p", label: "Proyecto", metrics: [], rows: [], hasMore: true }];
    render(<GroupedTable<Row> label="Tareas" columns={groupedTaskColumns} groups={groups} onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(onLoadMore).toHaveBeenCalledWith("p");
  });

  it("hidden groups are skipped with their anchors", () => {
    renderTable();
    expect(screen.queryByRole("region", { name: "Oficina Sur" })).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Ir a" });
    expect(within(nav).queryByRole("link", { name: /Oficina Sur/ })).toBeNull();
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
    expect(within(nav).getByText("tareas vencidas por proyecto")).toBeTruthy();
    const lomas = within(nav).getByRole("link", { name: /Casa Lomas/ });
    expect(lomas.getAttribute("href")).toBe(`#${groupAnchorId("casa-lomas")}`);
    expect(within(lomas).getByText("4").className).toContain("text-destructive");
    expect(within(within(nav).getByRole("link", { name: /Depto Roma/ })).getByText("0").className).toContain("text-muted-foreground");
  });

  it("anchor click expands and focuses the group", () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderTable({ defaultExpanded: false });
      fireEvent.click(screen.getByRole("link", { name: /Depto Roma/ }));
      const roma = header(/^Depto Roma/);
      expect(roma.getAttribute("aria-expanded")).toBe("true");
      expect(document.activeElement).toBe(roma);
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
      expect(screen.getByRole("region", { name: "Depto Roma" }).id).toBe(groupAnchorId("depto-roma"));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("loading, error and empty states", () => {
    const onRetry = vi.fn();
    const { container, rerender } = render(<GroupedTable<Row> label="Tareas" columns={groupedTaskColumns} groups={[]} loading />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    rerender(<GroupedTable<Row> label="Tareas" columns={groupedTaskColumns} groups={[]} error={{ onRetry }} />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<GroupedTable<Row> label="Tareas" columns={groupedTaskColumns} groups={[]} />);
    expect(screen.getByText("No hay resultados")).toBeTruthy();
    rerender(
      <GroupedTable<Row>
        label="Tareas"
        columns={groupedTaskColumns}
        groups={[{ id: "x", label: "Oculto", metrics: [], rows: [], hidden: true }]}
        emptyState={{ title: "Sin tareas vencidas" }}
      />,
    );
    expect(screen.getByText("Sin tareas vencidas")).toBeTruthy();
  });
});
