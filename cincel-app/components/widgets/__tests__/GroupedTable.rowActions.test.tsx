// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { GroupedTable, type GroupedTableProps } from "@/components/widgets/GroupedTable";
import { ConfirmDeleteDialog } from "@/components/widgets/ConfirmDeleteDialog";
import { ROW_ACTIONS_HEADER } from "@/components/widgets/RowActionsMenu";
import {
  groupedTaskColumns,
  groupedTaskGroups,
  type GroupedTaskRow,
} from "@/components/widgets/fixtures/grouped-table";

afterEach(cleanup);

type Row = GroupedTaskRow;

function renderTable(props: Partial<GroupedTableProps<Row>> = {}) {
  return render(
    <GroupedTable<Row>
      label="Tareas"
      columns={groupedTaskColumns}
      groups={groupedTaskGroups}
      getRowId={(row) => row.id}
      getRowLabel={(row) => row.tarea}
      {...props}
    />,
  );
}

const firstRow = () => document.querySelector<HTMLElement>('[data-slot="leaf-row"]')!;
const titleOf = (row: HTMLElement) => row.querySelector('td[data-column="tarea"]')!.textContent ?? "";

describe("GroupedTable row actions (#1041)", () => {
  it("adds nothing without rowActions", () => {
    renderTable();
    expect(document.querySelector('[data-slot="row-actions-cell"]')).toBeNull();
    expect(screen.queryAllByText(ROW_ACTIONS_HEADER)).toHaveLength(0);
  });

  it("adds a trailing ⋯ column whose destructive entries come last", async () => {
    const remove = vi.fn();
    const open = vi.fn();
    renderTable({
      rowActions: () => [
        { id: "eliminar", label: "Eliminar", destructive: true, onSelect: remove },
        { id: "abrir", label: "Abrir", onSelect: open },
      ],
    });
    const row = firstRow();
    const cells = row.querySelectorAll("td");
    expect(cells[cells.length - 1].dataset.slot).toBe("row-actions-cell");
    expect(screen.getAllByText(ROW_ACTIONS_HEADER).length).toBeGreaterThan(0);

    fireEvent.click(within(row).getByRole("button", { name: `Acciones de «${titleOf(row)}»` }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Abrir", "Eliminar"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Eliminar" }));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it("hides the menu on a row whose list is empty", () => {
    renderTable({ rowActions: () => [] });
    expect(within(firstRow()).queryByRole("button", { name: /^Acciones de/ })).toBeNull();
  });

  it("Supr on a focused row calls onRowDelete, not from a field", () => {
    const onRowDelete = vi.fn();
    renderTable({ rowActions: () => [{ id: "a", label: "Abrir", onSelect: vi.fn() }], onRowDelete });
    const row = firstRow();
    const trigger = within(row).getByRole("button", { name: /^Acciones de/ });
    fireEvent.keyDown(trigger, { key: "Delete" });
    expect(onRowDelete).toHaveBeenCalledTimes(1);
    expect(onRowDelete.mock.calls[0][0].tarea).toBe(titleOf(row));

    fireEvent.keyDown(trigger, { key: "Backspace" });
    fireEvent.keyDown(trigger, { key: "Delete", shiftKey: true });
    const input = document.createElement("input");
    row.querySelector("td")!.appendChild(input);
    fireEvent.keyDown(input, { key: "Delete" });
    expect(onRowDelete).toHaveBeenCalledTimes(1);
  });
});

describe("ConfirmDeleteDialog", () => {
  it("asks, cancels and confirms", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<ConfirmDeleteDialog open title="¿Eliminar «Planos»?" onOpenChange={onOpenChange} onConfirm={onConfirm} />);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("¿Eliminar «Planos»?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables the confirm button while pending", async () => {
    render(<ConfirmDeleteDialog open pending title="¿Eliminar?" onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    const confirm = within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });
});
