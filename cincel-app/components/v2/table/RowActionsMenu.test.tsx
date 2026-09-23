import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { DataTable } from "@/components/ui/DataTable";
import { createRowActionsColumn } from "./RowActionsMenu";

type Row = { name: string };

describe("row actions menu inside a clickable DataTable row", () => {
  it("runs the chosen action without also firing onRowClick", async () => {
    const onSelect = vi.fn();
    const onRowClick = vi.fn();
    render(
      <DataTable<Row>
        columns={[{ accessorKey: "name", header: "Nombre" }, createRowActionsColumn<Row>(() => [{ label: "Desactivar", onSelect }])]}
        data={[{ name: "Ana" }]}
        onRowClick={onRowClick}
      />
    );

    fireEvent.click(screen.getByLabelText("Acciones"));
    fireEvent.click(await screen.findByText("Desactivar"));

    expect(onSelect).toHaveBeenCalledWith({ name: "Ana" });
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
