import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "./DataTable";

type Row = { name: string; age: number };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Nombre" },
  { accessorKey: "age", header: "Edad" },
];

const data: Row[] = [
  { name: "Beto", age: 30 },
  { name: "Ana", age: 25 },
  { name: "Cris", age: 40 },
];

describe("DataTable", () => {
  it("renders headers and every row's cells", () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText("Nombre")).toBeTruthy();
    expect(screen.getByText("Edad")).toBeTruthy();
    expect(screen.getByText("Beto")).toBeTruthy();
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("Cris")).toBeTruthy();
  });

  it("shows the empty message when data is empty", () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="Nada por aquí" />);
    expect(screen.getByText("Nada por aquí")).toBeTruthy();
  });

  it("shows the loading message instead of rows when isLoading", () => {
    render(<DataTable columns={columns} data={data} isLoading loadingMessage="Espera…" />);
    expect(screen.getByText("Espera…")).toBeTruthy();
    expect(screen.queryByText("Beto")).toBeNull();
  });

  it("sorts a column ascending then descending then back to unsorted on repeated header clicks", () => {
    render(<DataTable columns={columns} data={data} />);
    const nameHeader = screen.getByText("Nombre");

    const rowNames = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.querySelector("td")?.textContent);

    expect(rowNames()).toEqual(["Beto", "Ana", "Cris"]); // insertion order, unsorted

    fireEvent.click(nameHeader);
    expect(rowNames()).toEqual(["Ana", "Beto", "Cris"]); // ascending

    fireEvent.click(nameHeader);
    expect(rowNames()).toEqual(["Cris", "Beto", "Ana"]); // descending

    fireEvent.click(nameHeader);
    expect(rowNames()).toEqual(["Beto", "Ana", "Cris"]); // back to unsorted
  });

  it("filters rows through the optional built-in search box", () => {
    render(<DataTable columns={columns} data={data} searchPlaceholder="Buscar…" />);
    const input = screen.getByPlaceholderText("Buscar…");

    fireEvent.change(input, { target: { value: "an" } });

    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.queryByText("Beto")).toBeNull();
    expect(screen.queryByText("Cris")).toBeNull();
  });

  it("calls onRowClick with the row's original data", () => {
    let clicked: Row | null = null;
    render(
      <DataTable columns={columns} data={data} onRowClick={(row) => (clicked = row)} />
    );
    fireEvent.click(screen.getByText("Beto"));
    expect(clicked).toEqual({ name: "Beto", age: 30 });
  });

  describe("drag-and-drop reordering (onReorderRows)", () => {
    const getRowId = (row: Row) => row.name;

    function dragRow(fromText: string, toText: string) {
      const grips = screen.getAllByTitle("Arrastra para reordenar");
      const rows = screen.getAllByRole("row").slice(1);
      const fromCell = screen.getByText(fromText).closest("tr")!;
      const toCell = screen.getByText(toText).closest("tr")!;
      const fromGrip = grips[rows.indexOf(fromCell)];
      const toRow = toCell;

      const dataTransfer = {};
      fireEvent.dragStart(fromGrip, { dataTransfer });
      fireEvent.dragOver(toRow, { dataTransfer });
      fireEvent.drop(toRow, { dataTransfer });
    }

    it("renders a grip column and reports the new row order on drop", () => {
      const onReorderRows = vi.fn();
      render(<DataTable columns={columns} data={data} getRowId={getRowId} onReorderRows={onReorderRows} />);

      expect(screen.getAllByTitle("Arrastra para reordenar")).toHaveLength(3);

      dragRow("Beto", "Cris");

      expect(onReorderRows).toHaveBeenCalledWith(["Ana", "Cris", "Beto"]);
    });

    it("does not render the grip column when onReorderRows is not passed", () => {
      render(<DataTable columns={columns} data={data} getRowId={getRowId} />);
      expect(screen.queryAllByTitle("Arrastra para reordenar")).toHaveLength(0);
    });

    it("disables reordering while a column sort is active", () => {
      render(<DataTable columns={columns} data={data} getRowId={getRowId} onReorderRows={vi.fn()} />);
      expect(screen.getAllByTitle("Arrastra para reordenar")).toHaveLength(3);

      fireEvent.click(screen.getByText("Nombre"));

      expect(screen.queryAllByTitle("Arrastra para reordenar")).toHaveLength(0);
    });

    it("disables reordering while the search filter is active", () => {
      render(
        <DataTable columns={columns} data={data} getRowId={getRowId} onReorderRows={vi.fn()} searchPlaceholder="Buscar…" />
      );
      expect(screen.getAllByTitle("Arrastra para reordenar")).toHaveLength(3);

      fireEvent.change(screen.getByPlaceholderText("Buscar…"), { target: { value: "an" } });

      expect(screen.queryAllByTitle("Arrastra para reordenar")).toHaveLength(0);
    });
  });
});
