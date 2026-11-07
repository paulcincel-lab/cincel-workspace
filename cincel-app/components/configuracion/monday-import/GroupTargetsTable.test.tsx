// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, useState } from "react";

vi.mock("@/components/configuracion/monday-import/ChoiceSelect", async () => ({
  ChoiceSelect: (await import("./test-choices")).NativeChoiceSelect,
}));

import { GroupTargetsTable } from "./GroupTargetsTable";
import { DISENO, EJECUTIVO, testChoices } from "./test-choices";
import type { BoardDraft } from "@/lib/monday-import/wizard-steps";
import type { MondayBoardSource } from "@/lib/types/monday-import";

function source(groups: MondayBoardSource["groups"]): MondayBoardSource {
  return {
    id: "301",
    name: "Casa Lomas",
    columns: [],
    subitemColumns: [],
    groups,
    statusLabels: {},
    itemCount: 0,
    items: [],
  };
}

let latest: BoardDraft | null = null;

function Harness({
  groups,
  strategy = "board_as_project",
}: {
  groups: MondayBoardSource["groups"];
  strategy?: BoardDraft["strategy"];
}) {
  const [board, setBoard] = useState<BoardDraft>({
    mondayBoardId: "301",
    name: "Casa Lomas",
    strategy,
    workflowId: DISENO,
    columns: {},
  } as BoardDraft);
  useEffect(() => {
    latest = board;
  });
  return (
    <GroupTargetsTable
      board={board}
      source={source(groups)}
      choices={testChoices}
      clientChoices={[{ value: "none", label: "Sin cliente" }]}
      onBoardChange={(update) => setBoard((current) => update(current))}
    />
  );
}

function selectFor(title: string): HTMLSelectElement {
  return screen.getByRole("combobox", { name: `Equivalente de ${title}` }) as HTMLSelectElement;
}

function optionLabels(select: HTMLSelectElement): string[] {
  return within(select)
    .getAllByRole("option")
    .map((option) => option.textContent ?? "")
    .filter((label) => label !== "Elige una opción");
}

function selectedLabel(select: HTMLSelectElement): string {
  return select.selectedOptions[0]?.textContent ?? "";
}

afterEach(() => {
  cleanup();
  latest = null;
});

describe("GroupTargetsTable", () => {
  it("has the header Grupo de monday · En Cincel", () => {
    render(<Harness groups={[{ id: "g1", title: "Extras" }]} />);
    expect(screen.getByRole("columnheader", { name: "Grupo de monday" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "En Cincel" })).toBeTruthy();
  });

  it("offers exactly the six targets, in order, on a board_as_project board", () => {
    render(<Harness groups={[{ id: "g1", title: "Extras" }]} />);
    expect(optionLabels(selectFor("Extras"))).toEqual([
      "Tramo «Presale»",
      "Tramo «Diseño»",
      "Tramo «Construcción»",
      "Fase «Anteproyecto» · Diseño",
      "Fase «Ejecutivo» · Diseño",
      "Fase «Obra negra» · Construcción",
      "Espacio «Extras»",
      "Proyecto aparte «Extras»",
      "Tareas de administración",
      "Ignorar",
    ]);
  });

  it("drops Proyecto aparte on an item_as_project board", () => {
    render(<Harness strategy="item_as_project" groups={[{ id: "g1", title: "Extras" }]} />);
    const labels = optionLabels(selectFor("Extras"));
    expect(labels).not.toContain("Proyecto aparte «Extras»");
    expect(labels).toContain("Espacio «Extras»");
    expect(labels).toContain("Tareas de administración");
    expect(labels).toContain("Ignorar");
  });

  it("never offers the removed targets", () => {
    render(<Harness groups={[{ id: "g1", title: "Extras" }]} />);
    const labels = optionLabels(selectFor("Extras")).join("\n");
    expect(labels).not.toMatch(/Fase nueva/);
    expect(labels).not.toMatch(/Etapa «/);
    expect(labels).not.toMatch(/de workflow/);
  });

  it("defaults each group by name, ignoring case and accents", () => {
    render(
      <Harness
        groups={[
          { id: "g1", title: "construccion" },
          { id: "g2", title: "ANTEPROYECTO" },
          { id: "g3", title: "Obra Negra" },
          { id: "g4", title: "Administrativo" },
          { id: "g5", title: "Extras" },
        ]}
      />,
    );
    expect(selectedLabel(selectFor("construccion"))).toBe("Tramo «Construcción»");
    expect(selectedLabel(selectFor("ANTEPROYECTO"))).toBe("Fase «Anteproyecto» · Diseño");
    expect(selectedLabel(selectFor("Obra Negra"))).toBe("Fase «Obra negra» · Construcción");
    expect(selectedLabel(selectFor("Administrativo"))).toBe("Tareas de administración");
    expect(selectedLabel(selectFor("Extras"))).toBe("Tramo «Diseño»");
  });

  it("saves the chosen target and explains Ignorar", () => {
    render(<Harness groups={[{ id: "g1", title: "Extras" }]} />);
    expect(screen.queryByText("Los elementos de este grupo no se importan.")).toBeNull();
    fireEvent.change(selectFor("Extras"), { target: { value: "ignore" } });
    expect(latest?.groupTargets?.g1).toEqual({ kind: "ignore" });
    expect(screen.getByText("Los elementos de este grupo no se importan.")).toBeTruthy();
    fireEvent.change(selectFor("Extras"), { target: { value: `phase:${EJECUTIVO}` } });
    expect(latest?.groupTargets?.g1).toEqual({ kind: "phase", phaseId: EJECUTIVO });
  });

  it("asks for the client of a group that becomes a separate project", () => {
    render(<Harness groups={[{ id: "g1", title: "Extras" }]} />);
    expect(screen.queryByRole("combobox", { name: "Cliente de Extras" })).toBeNull();
    fireEvent.change(selectFor("Extras"), { target: { value: "project" } });
    expect(screen.getByRole("combobox", { name: "Cliente de Extras" })).toBeTruthy();
  });

  it("suggests Grupo como proyecto when the groups are named like clients", () => {
    render(
      <Harness
        groups={[
          { id: "g1", title: "Familia Pérez" },
          { id: "g2", title: "Grupo Norte" },
        ]}
      />,
    );
    expect(screen.getByText("Los grupos parecen clientes u obras")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Usar «Grupo como proyecto»" }));
    expect(latest?.strategy).toBe("group_as_project");
    expect(Object.keys(latest?.groupClients ?? {})).toEqual(["g1", "g2"]);
  });
});
