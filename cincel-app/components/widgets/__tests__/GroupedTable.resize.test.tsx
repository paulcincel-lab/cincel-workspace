// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { GroupedTable, type GroupedTableProps } from "@/components/widgets/GroupedTable";
import {
  groupedTaskColumns,
  groupedTaskGroups,
  type GroupedTaskRow,
} from "@/components/widgets/fixtures/grouped-table";
import type { RecordColumn } from "@/lib/types/widgets";

vi.mock("@/lib/actions/table-widths-actions", () => ({ setTableColumnWidthsAction: vi.fn() }));

type Row = GroupedTaskRow;

const columns: RecordColumn[] = groupedTaskColumns.map((column) =>
  column.key === "tarea" ? { key: "tarea", label: "Tarea", fill: true } : column,
);

function mockViewport(desktop: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function renderTable(props: Partial<GroupedTableProps<Row>> = {}) {
  return render(<GroupedTable<Row> label="Tareas" columns={columns} groups={groupedTaskGroups} tableId="tareas-test" {...props} />);
}

beforeEach(() => mockViewport(true));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GroupedTable column widths (#1125)", () => {
  it("gives every table a colgroup and a title column that takes the rest", () => {
    const { container } = renderTable();
    const root = container.querySelector<HTMLElement>("[data-slot=grouped-table]")!;
    const table = container.querySelector("table")!;
    expect(table.querySelectorAll("colgroup > col")).toHaveLength(columns.length);
    expect(table.className).toContain("table-fixed");
    expect(root.style.getPropertyValue("--cw-tarea")).toBe("auto");
    expect(root.style.getPropertyValue("--cw-responsable")).toBe("140px");
    expect(root.style.getPropertyValue("--tw")).toBe("100%");
  });

  it("each header has a vertical separator handle with its width and a label", () => {
    renderTable();
    const handle = screen.getAllByRole("separator", { name: "Ancho de la columna Responsable" })[0];
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuenow")).toBe("140");
    expect(handle.getAttribute("tabindex")).toBe("0");
  });

  it("Left and Right change the width by 16 px and set the table to the sum of its columns", () => {
    const { container } = renderTable();
    const root = container.querySelector<HTMLElement>("[data-slot=grouped-table]")!;
    const handle = screen.getAllByRole("separator", { name: "Ancho de la columna Responsable" })[0];
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(root.style.getPropertyValue("--cw-responsable")).toBe("156px");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(root.style.getPropertyValue("--cw-responsable")).toBe("124px");
    // The title column keeps taking the rest: nothing else changes.
    expect(root.style.getPropertyValue("--cw-tarea")).toBe("auto");
  });

  it("a pointer drag follows the pointer and stops at the column's minimum", () => {
    const { container } = renderTable();
    const root = container.querySelector<HTMLElement>("[data-slot=grouped-table]")!;
    const handle = screen.getAllByRole("separator", { name: "Ancho de la columna Estatus" })[0];
    handle.parentElement!.getBoundingClientRect = () => ({ width: 120 }) as DOMRect;
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 560, pointerId: 1 });
    expect(root.style.getPropertyValue("--cw-estatus")).toBe("180px");
    fireEvent.pointerMove(handle, { clientX: 100, pointerId: 1 });
    expect(root.style.getPropertyValue("--cw-estatus")).toBe("64px");
    fireEvent.pointerUp(handle, { clientX: 100, pointerId: 1 });
  });

  it("does not re-render the rows while dragging", () => {
    const renderCell = vi.fn(() => undefined);
    renderTable({ renderCell });
    const handle = screen.getAllByRole("separator", { name: "Ancho de la columna Estatus" })[0];
    handle.parentElement!.getBoundingClientRect = () => ({ width: 120 }) as DOMRect;
    const before = renderCell.mock.calls.length;
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 540, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 580, pointerId: 1 });
    expect(renderCell.mock.calls.length).toBe(before);
    fireEvent.pointerUp(handle, { clientX: 580, pointerId: 1 });
  });

  it("shows no handle without a table id or below the desktop breakpoint", () => {
    renderTable({ tableId: undefined });
    expect(screen.queryAllByRole("separator")).toHaveLength(0);
    cleanup();
    mockViewport(false);
    renderTable();
    expect(screen.queryAllByRole("separator")).toHaveLength(0);
  });

  it("the checkbox and row-actions columns are not resizable", () => {
    renderTable({ selectable: true, selectedIds: new Set<string>(), onSelectionChange: () => undefined, rowActions: () => [] });
    const names = screen.getAllByRole("separator").map((el) => el.getAttribute("aria-label"));
    expect(names.every((name) => name?.startsWith("Ancho de la columna "))).toBe(true);
    expect(names).not.toContain("Ancho de la columna ");
  });
});
