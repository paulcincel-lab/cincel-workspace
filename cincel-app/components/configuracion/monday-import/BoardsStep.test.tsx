// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { BoardsStep } from "./BoardsStep";
import type { MondayConnection, MondayImportRunState } from "@/lib/types/monday-import";

const connection: MondayConnection = {
  account: { id: "1", slug: "cincel", name: "Cincel" },
  tokenUser: { name: "Ana López", email: "ana@example.test" },
  tokenSource: "input",
  workspaces: [{ id: "w1", name: "Obras" }],
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
  ],
  estimatedCalls: 5,
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
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("BoardsStep board checkboxes", () => {
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

  it("toggles the board from anywhere in its row", () => {
    const onChange = vi.fn();
    render(<Harness initial={["b2"]} onChange={onChange} />);

    fireEvent.click(screen.getByText("Depto Gómez"));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByRole("checkbox", { name: "Importar Depto Gómez" }).getAttribute("aria-checked")).toBe("false");

    fireEvent.click(screen.getByText("Casa Ruiz"));
    expect(onChange).toHaveBeenLastCalledWith(["b1"]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
