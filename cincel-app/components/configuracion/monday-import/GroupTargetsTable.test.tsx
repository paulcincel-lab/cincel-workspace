// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";

import { GroupTargetsTable } from "./GroupTargetsTable";
import type { BoardDraft } from "@/lib/monday-import/wizard-steps";
import type { MondayBoardSource, MondayImportChoices } from "@/lib/types/monday-import";

const WORKFLOW = "11111111-1111-4111-8111-111111111111";

const choices: MondayImportChoices = {
  statuses: [],
  areas: [],
  workflows: [{ id: WORKFLOW, name: "Diseño" }],
  templates: [{ id: "t1", workflowId: WORKFLOW, name: "Planos", phase: "Anteproyecto" }],
  clients: [
    { id: "22222222-2222-4222-8222-222222222222", name: "Familia Pérez" },
    { id: "33333333-3333-4333-8333-333333333333", name: "Grupo Norte" },
  ],
  staff: [],
  providerSubtypes: [],
};

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

function Harness({ groups }: { groups: MondayBoardSource["groups"] }) {
  const [board, setBoard] = useState<BoardDraft>({
    mondayBoardId: "301",
    name: "Casa Lomas",
    strategy: "board_as_project",
    workflowId: WORKFLOW,
    columns: {},
    statusMaps: {},
  });
  useEffect(() => {
    latest = board;
  });
  return (
    <GroupTargetsTable
      board={board}
      source={source(groups)}
      choices={choices}
      clientChoices={[{ value: "none", label: "Sin cliente" }]}
      onBoardChange={(update) => setBoard((current) => update(current))}
    />
  );
}

afterEach(() => {
  cleanup();
  latest = null;
});

describe("GroupTargetsTable (#687)", () => {
  it("shows every group with its default: the workflow phase of the same name, else a new phase", () => {
    render(
      <Harness
        groups={[
          { id: "g1", title: "Anteproyecto" },
          { id: "g2", title: "Extras" },
        ]}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Equivalente de Anteproyecto" }).textContent).toContain(
      "Fase «Anteproyecto» de Diseño",
    );
    expect(screen.getByRole("combobox", { name: "Equivalente de Extras" }).textContent).toContain(
      "Fase nueva «Extras» del proyecto",
    );
    expect(screen.queryByText("Los grupos parecen clientes u obras")).toBeNull();
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
