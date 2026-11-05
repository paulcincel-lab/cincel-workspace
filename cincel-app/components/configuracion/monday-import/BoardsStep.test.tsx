// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { BoardsStep } from "./BoardsStep";
import { buildBoardCards } from "@/lib/monday-import/board-cards";
import type { MondayConnection, MondayImportRunState } from "@/lib/types/monday-import";

const connection: MondayConnection = {
  account: { id: "1", slug: "cincel", name: "Cincel" },
  tokenUser: { name: "Ana Prueba", email: "ana@example.test" },
  tokenSource: "input",
  workspaces: [
    { id: "w1", name: "Obras" },
    { id: "w2", name: "Ventas" },
  ],
  boards: [
    {
      id: "b1",
      name: "Casa Ruiz",
      workspaceId: "w1",
      workspaceName: "Obras",
      itemsCount: 12,
      hierarchyType: null,
      estimatedCalls: 3,
    },
    {
      id: "b2",
      name: "Depto Gómez",
      workspaceId: "w1",
      workspaceName: "Obras",
      itemsCount: 4,
      hierarchyType: null,
      estimatedCalls: 2,
    },
    {
      id: "b3",
      name: "Clientes",
      workspaceId: "w2",
      workspaceName: "Ventas",
      itemsCount: 7,
      hierarchyType: null,
      estimatedCalls: 1,
    },
  ],
  estimatedCalls: 6,
};

const run: MondayImportRunState = {
  runId: "r1",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  step: "tableros",
  account: connection.account,
  boardIds: [],
  exportOptions: { updates: true, files: true },
  exported: false,
  mapping: null,
  jobs: {},
  batchId: null,
  batchStatus: null,
};

function Harness({ initial, onChange }: { initial: string[]; onChange: (ids: string[]) => void }) {
  const [selected, setSelected] = useState(initial);
  return (
    <BoardsStep
      connection={connection}
      run={run}
      selectedBoardIds={selected}
      onSelectedChange={(ids) => {
        setSelected(ids);
        onChange(ids);
      }}
      exportChoice={{ updates: true, files: true }}
      onExportChoiceChange={() => {}}
      onStartExport={() => {}}
      isPending={false}
      mapping={null}
      onMappingChange={() => {}}
      cards={buildBoardCards({ connection, mapping: null, source: null, preview: null, reviewed: new Set() })}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("BoardsStep board cards (#685)", () => {
  it("names each checkbox after its board and shows its checked state", () => {
    render(<Harness initial={["b1"]} onChange={() => {}} />);

    const ruiz = screen.getByRole("checkbox", { name: "Importar Casa Ruiz" });
    const gomez = screen.getByRole("checkbox", { name: "Importar Depto Gómez" });
    expect(ruiz.getAttribute("aria-checked")).toBe("true");
    expect(gomez.getAttribute("aria-checked")).toBe("false");
  });

  it("keeps the plain checkbox inside a flex wrapper, without size overrides", () => {
    render(<Harness initial={[]} onChange={() => {}} />);

    const box = screen.getByRole("checkbox", { name: "Importar Casa Ruiz" });
    expect(box.className).toContain("size-4");
    expect(box.className).not.toMatch(/\b(h|w)-(?!4\b)/);
    expect(box.parentElement?.className).toContain("flex");
  });

  it("toggles the board from the checkbox", () => {
    const onChange = vi.fn();
    render(<Harness initial={[]} onChange={onChange} />);

    const box = screen.getByRole("checkbox", { name: "Importar Casa Ruiz" });
    fireEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith(["b1"]);
    expect(box.getAttribute("aria-checked")).toBe("true");
  });

  it("toggles the board from anywhere on its card", () => {
    const onChange = vi.fn();
    render(<Harness initial={["b2"]} onChange={onChange} />);

    fireEvent.click(screen.getByText("Depto Gómez"));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByRole("checkbox", { name: "Importar Depto Gómez" }).getAttribute("aria-checked")).toBe("false");

    fireEvent.click(screen.getByText("Casa Ruiz"));
    expect(onChange).toHaveBeenLastCalledWith(["b1"]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("selects nothing by default; Seleccionar todos and Ninguno act on the visible cards", () => {
    const onChange = vi.fn();
    render(<Harness initial={[]} onChange={onChange} />);

    for (const name of ["Casa Ruiz", "Depto Gómez", "Clientes"])
      expect(screen.getByRole("checkbox", { name: `Importar ${name}` }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("button", { name: "Ninguno" }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar tableros" }), { target: { value: "obras" } });
    expect(screen.queryByText("Clientes")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar todos" }));
    expect(onChange).toHaveBeenLastCalledWith(["b1", "b2"]);

    fireEvent.click(screen.getByRole("button", { name: "Ninguno" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("shows each board's workspace, item count and «mapear» before the export, with its mapping closed", () => {
    render(<Harness initial={[]} onChange={() => {}} />);

    const card = screen.getByRole("group", { name: "Casa Ruiz" });
    expect(card.textContent).toContain("Obras");
    expect(card.textContent).toContain("12 elementos");
    expect(card.textContent).toContain("mapear");
    expect(screen.getByRole("button", { name: "Abrir mapeo de Casa Ruiz" }).hasAttribute("disabled")).toBe(true);
  });

  it("filters the cards by workspace", () => {
    render(<Harness initial={[]} onChange={() => {}} />);

    expect(screen.getByRole("combobox", { name: "Espacio de trabajo" })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar tableros" }), { target: { value: "zzz" } });
    expect(screen.getByText("Ningún tablero coincide con la búsqueda.")).toBeTruthy();
  });
});
