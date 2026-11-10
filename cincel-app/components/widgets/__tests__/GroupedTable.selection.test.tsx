// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DataTable } from "@/components/ui/DataTable";
import type { CellEdit } from "@/components/widgets/editable-cell";
import { GroupedTable, type GroupedTableProps } from "@/components/widgets/GroupedTable";
import { SELECT_ALL_LABEL } from "@/components/widgets/table-rows";
import {
  groupedTaskColumns,
  groupedTaskGroups,
  type GroupedTaskRow,
} from "@/components/widgets/fixtures/grouped-table";

afterEach(cleanup);

type Row = GroupedTaskRow;

/** The table with its selection kept in state, like a page with `useTaskSelection`. */
function Harness(props: Partial<GroupedTableProps<Row>> & { onChange?(ids: ReadonlySet<string>): void }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  return (
    <GroupedTable<Row>
      label="Tareas"
      columns={groupedTaskColumns}
      groups={groupedTaskGroups}
      getRowId={(row) => row.id}
      getRowLabel={(row) => row.tarea}
      selectable
      selectedIds={selected}
      onSelectionChange={(ids) => {
        setSelected(ids);
        props.onChange?.(ids);
      }}
      {...props}
    />
  );
}

const leafRows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="leaf-row"]'));
const titleOf = (row: HTMLElement) => row.querySelector('td[data-column="tarea"]')!.textContent ?? "";
const checkboxOf = (row: HTMLElement) => within(row).getByRole("checkbox");
const selectedTitles = () => leafRows().filter((row) => row.hasAttribute("data-selected")).map(titleOf);

describe("GroupedTable row checkboxes (#1040)", () => {
  it("adds nothing without selectable", () => {
    render(<GroupedTable<Row> label="Tareas" columns={groupedTaskColumns} groups={groupedTaskGroups} getRowId={(row) => row.id} />);
    expect(document.querySelector('[data-slot="row-select-cell"]')).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("puts a labelled checkbox in a leading column of every row", () => {
    render(<Harness />);
    const [row] = leafRows();
    expect(row.querySelector("td")!.dataset.slot).toBe("row-select-cell");
    expect(checkboxOf(row).getAttribute("aria-label")).toBe(`Seleccionar «${titleOf(row)}»`);
  });

  it("selects one row, then another; a second click unselects", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const [a, b] = leafRows();
    fireEvent.click(checkboxOf(a));
    fireEvent.click(checkboxOf(b));
    expect(selectedTitles()).toEqual([titleOf(a), titleOf(b)]);
    fireEvent.click(checkboxOf(a));
    expect(selectedTitles()).toEqual([titleOf(b)]);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("shift-click selects the range from the last clicked row, across groups", () => {
    render(<Harness />);
    const rows = leafRows();
    fireEvent.click(checkboxOf(rows[0]));
    const last = checkboxOf(rows[4]);
    fireEvent.pointerDown(last, { shiftKey: true });
    fireEvent.click(last, { shiftKey: true });
    expect(selectedTitles()).toEqual(rows.slice(0, 5).map(titleOf));
  });

  it("the header checkbox selects every row of its group card, then none; mixed in between", () => {
    render(<Harness />);
    const card = screen.getAllByRole("region")[0];
    const header = within(card).getAllByRole("checkbox", { name: SELECT_ALL_LABEL })[0];
    const cardRows = Array.from(card.querySelectorAll<HTMLElement>('[data-slot="leaf-row"]'));
    fireEvent.click(checkboxOf(cardRows[0]));
    expect(header.getAttribute("aria-checked")).toBe("mixed");
    fireEvent.click(header);
    expect(selectedTitles()).toEqual(cardRows.map(titleOf));
    expect(header.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(header);
    expect(selectedTitles()).toEqual([]);
  });

  it("in the table layout the header checkbox selects the whole table", () => {
    render(<Harness layout="table" groups={groupedTaskGroups.flatMap((g) => g.children ?? [])} />);
    fireEvent.click(screen.getByRole("checkbox", { name: SELECT_ALL_LABEL }));
    expect(selectedTitles()).toHaveLength(leafRows().length);
  });

  it("Esc clears the selection; Space on a focused grid cell toggles its row", () => {
    const edit: CellEdit<Row> = { kind: "text", value: (row) => row.tarea, commit: async () => ({ ok: true, data: null }) };
    const columns = groupedTaskColumns.map((column) => (column.key === "tarea" ? { ...column, edit } : column));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness columns={columns} />
      </QueryClientProvider>,
    );
    const [row] = leafRows();
    const cell = row.querySelector<HTMLElement>("[data-grid-cell]")!;
    cell.focus();
    fireEvent.keyDown(cell, { key: " " });
    expect(selectedTitles()).toEqual([titleOf(row)]);
    fireEvent.keyDown(cell, { key: "Escape" });
    expect(selectedTitles()).toEqual([]);
  });
});

describe("DataTable row checkboxes (#1040)", () => {
  type Item = { id: string; name: string };
  const items: Item[] = [
    { id: "a", name: "Alfa" },
    { id: "b", name: "Beta" },
    { id: "c", name: "Gama" },
  ];
  const columns: ColumnDef<Item, unknown>[] = [{ id: "name", header: "Nombre", accessorFn: (row) => row.name }];

  function Table({ onRowClick }: { onRowClick?(row: Item): void }) {
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    return (
      <DataTable<Item>
        columns={columns}
        data={items}
        getRowId={(row) => row.id}
        getRowLabel={(row) => row.name}
        onRowClick={onRowClick}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
      />
    );
  }

  it("selects rows, ranges and all without opening the row", () => {
    const onRowClick = vi.fn();
    render(<Table onRowClick={onRowClick} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar «Alfa»" }));
    const gama = screen.getByRole("checkbox", { name: "Seleccionar «Gama»" });
    fireEvent.pointerDown(gama, { shiftKey: true });
    fireEvent.click(gama, { shiftKey: true });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.getAttribute("data-state"))).toEqual(["selected", "selected", "selected"]);
    expect(onRowClick).not.toHaveBeenCalled();

    const header = screen.getByRole("checkbox", { name: SELECT_ALL_LABEL });
    expect(header.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(header);
    expect(screen.getAllByRole("row").slice(1).every((row) => !row.hasAttribute("data-state"))).toBe(true);
  });
});
