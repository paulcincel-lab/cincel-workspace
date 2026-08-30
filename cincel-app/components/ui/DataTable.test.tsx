import { describe, expect, it } from "vitest";
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
});
