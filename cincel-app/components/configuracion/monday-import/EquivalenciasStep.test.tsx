// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";

import { renderWithQueryClient } from "@/lib/query/test-utils";
import { useState } from "react";

vi.mock("@/components/configuracion/monday-import/ChoiceSelect", async () => ({
  ChoiceSelect: (await import("./test-choices")).NativeChoiceSelect,
}));
vi.mock("@/lib/actions/task-statuses-actions", () => ({ createTaskStatusAction: vi.fn() }));
vi.mock("@/lib/actions/monday-import-actions", () => ({
  saveMondayStatusMapAction: vi.fn(async (statusMap: unknown) => ({ ok: true, statusMap })),
}));

import { BoardEquivalences, EquivalenciasStep } from "./EquivalenciasStep";
import { DISENO, PLANOS_TEMPLATE, testChoices } from "./test-choices";
import type { BoardDraft } from "@/lib/monday-import/wizard-steps";
import type { MondayBoardSource, MondayExportSource } from "@/lib/types/monday-import";
import type { MappingInput } from "@/scripts/monday/mapping.schema";

function boardSource(
  groups: MondayBoardSource["groups"],
  items: MondayBoardSource["items"] = [],
): MondayBoardSource {
  return {
    id: "301",
    name: "Casa Lomas",
    columns: [],
    subitemColumns: [],
    groups,
    statusLabels: {},
    itemCount: items.length,
    items,
  };
}

function draft(overrides: Partial<BoardDraft> = {}): BoardDraft {
  return {
    mondayBoardId: "301",
    name: "Casa Lomas",
    strategy: "board_as_project",
    workflowId: DISENO,
    columns: {},
    ...overrides,
  } as BoardDraft;
}

function Harness({ initial, source }: { initial: BoardDraft; source: MondayBoardSource }) {
  const [board, setBoard] = useState(initial);
  return (
    <BoardEquivalences
      board={board}
      source={source}
      choices={testChoices}
      onBoardChange={(update) => setBoard((current) => update(current))}
    />
  );
}

function rowOf(itemName: string): HTMLElement {
  return screen.getByRole("cell", { name: itemName }).closest("tr") as HTMLElement;
}

afterEach(() => {
  cleanup();
});

describe("EquivalenciasStep · Grupos y tramo", () => {
  it("has one Tramo del tablero select and no department, workflow or task área controls", () => {
    renderWithQueryClient(<Harness initial={draft()} source={boardSource([{ id: "g1", title: "Extras" }])} />);
    expect(screen.getByRole("heading", { name: "Grupos y tramo" })).toBeTruthy();
    const tramo = screen.getByRole("combobox", { name: "Tramo del tablero" }) as HTMLSelectElement;
    expect(within(tramo).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Elige una opción",
      "Sin tramo",
      "Presale",
      "Diseño",
      "Construcción",
    ]);
    expect(screen.queryByRole("combobox", { name: "Departamento" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Workflow" })).toBeNull();
    expect(screen.queryByText("Grupos, departamento y workflow")).toBeNull();
    expect(screen.queryByText("Área y workflow de las tareas")).toBeNull();
    expect(screen.queryByText("Área sin equivalente")).toBeNull();
  });

  it("requires the tramo when no group targets a tramo or fase", () => {
    renderWithQueryClient(
      <Harness
        initial={draft({ strategy: "group_as_project", workflowId: null })}
        source={boardSource([{ id: "g1", title: "Familia Pérez" }])}
      />,
    );
    expect(screen.getByText("Elige un tramo.")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Tramo del tablero" }), { target: { value: DISENO } });
    expect(screen.queryByText("Elige un tramo.")).toBeNull();
  });

  it("doesn't require it when a group already targets a tramo", () => {
    renderWithQueryClient(
      <Harness
        initial={draft({ workflowId: null })}
        source={boardSource([
          { id: "g1", title: "Construcción" },
          { id: "g2", title: "Extras" },
        ])}
      />,
    );
    expect(screen.queryByText("Elige un tramo.")).toBeNull();
  });
});

describe("EquivalenciasStep · Tareas de plantilla", () => {
  const groups = [
    { id: "g1", title: "Proyecto" },
    { id: "g2", title: "Administrativo" },
  ];
  const items = [
    { id: "i1", name: "1. Planos", groupId: "g1" },
    { id: "i2", name: "Revisión de anteproyecto", groupId: "g1" },
    { id: "i3", name: "Fachadas", groupId: "g1" },
    { id: "i4", name: "Pago de anticipo", groupId: "g2" },
  ];

  it("shows each item's Tramo · Fase and flags the ones without a fase", () => {
    renderWithQueryClient(
      <Harness
        initial={draft({ templateMatches: { i1: PLANOS_TEMPLATE } })}
        source={boardSource(groups, items)}
      />,
    );
    expect(screen.getByRole("heading", { name: "Tareas de plantilla" })).toBeTruthy();
    expect(screen.queryByText("Plantillas del workflow")).toBeNull();

    expect(within(rowOf("1. Planos")).getByText("Diseño · Ejecutivo")).toBeTruthy();
    expect(within(rowOf("Revisión de anteproyecto")).getByText("Diseño · Anteproyecto")).toBeTruthy();

    const unresolved = rowOf("Fachadas");
    expect(within(unresolved).getByText("Diseño")).toBeTruthy();
    expect(within(unresolved).getByText("Sin fase · revisar")).toBeTruthy();

    const admin = rowOf("Pago de anticipo");
    expect(within(admin).getByText("Tareas de administración")).toBeTruthy();
    expect(within(admin).queryByText("Sin fase · revisar")).toBeNull();
    expect(within(admin).queryByRole("combobox")).toBeNull();

    expect(screen.getAllByText("Sin fase · revisar")).toHaveLength(1);
  });

  it("keeps the template select for overrides", () => {
    renderWithQueryClient(<Harness initial={draft()} source={boardSource(groups, items)} />);
    const row = rowOf("Fachadas");
    expect(within(row).getByText("Sin fase · revisar")).toBeTruthy();
    fireEvent.change(within(row).getByRole("combobox", { name: "Plantilla para Fachadas" }), {
      target: { value: PLANOS_TEMPLATE },
    });
    expect(within(rowOf("Fachadas")).getByText("Diseño · Ejecutivo")).toBeTruthy();
    expect(within(rowOf("Fachadas")).queryByText("Sin fase · revisar")).toBeNull();
  });
});

describe("EquivalenciasStep · Cliente (opcional)", () => {
  const source: MondayExportSource = {
    boards: [boardSource([{ id: "g1", title: "Extras" }])],
    users: [],
    hasFiles: false,
    hasUpdates: false,
  };
  const mapping = {
    version: 1,
    boards: [draft({ client: null })],
    people: {},
    options: { includeUpdates: true, includeFiles: true },
  } as unknown as MappingInput;

  it("doesn't block a board without a client", () => {
    renderWithQueryClient(
      <EquivalenciasStep
        mapping={mapping}
        source={source}
        choices={testChoices}
        onMappingChange={() => {}}
        onStatusCreated={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: "Cliente (opcional)" })).toBeTruthy();
    expect(
      screen.getByText("Sin cliente, cada proyecto se crea con la tarea de administración «Asignar cliente y origen»."),
    ).toBeTruthy();
    expect(screen.queryByText("Cliente (obligatorio)")).toBeNull();
    expect(screen.queryByText("Faltan clientes")).toBeNull();
    expect(screen.queryByText(/la Vista previa no dejará importar/)).toBeNull();
    expect(screen.queryByText(/Este tablero no tiene cliente/)).toBeNull();
    const picker = screen.getByRole("combobox", { name: "Tablero" });
    expect(within(picker).getByRole("option", { name: "Casa Lomas" })).toBeTruthy();
    expect(within(picker).queryByRole("option", { name: /sin cliente/ })).toBeNull();
  });
});
