// @vitest-environment node
/** "Área y workflow de las tareas" on Equivalencias (#686): source, pre-fill by name and value targets. */
import { describe, expect, it } from "vitest";

import { issueText, ISSUE_FIX_STEP } from "@/lib/monday-import/preview-issues";
import {
  CREATE_AREA,
  IGNORE,
  UNMAPPED,
  decodeTaskAreaChoice,
  decodeTaskAreaSource,
  encodeTaskAreaChoice,
  encodeTaskAreaSource,
  setTaskAreaSource,
  setTaskAreaTarget,
  suggestTaskArea,
  taskAreaColumns,
  taskAreaValues,
  unmappedTaskAreaValues,
  workflowsForArea,
} from "@/lib/monday-import/task-areas";
import type { BoardDraft } from "@/lib/monday-import/wizard-steps";
import type { MondayBoardSource, MondayImportChoices } from "@/lib/types/monday-import";

const choices: MondayImportChoices = {
  statuses: [],
  areas: [
    { id: "a-diseno", name: "Diseño", workflowIds: ["w-diseno", "w-render"] },
    { id: "a-obra", name: "Construcción", workflowIds: ["w-obra"] },
    { id: "a-libre", name: "Presale", workflowIds: [] },
  ],
  workflows: [
    { id: "w-diseno", name: "Diseño" },
    { id: "w-render", name: "Render" },
    { id: "w-obra", name: "Obra" },
  ],
  templates: [],
  clients: [],
  staff: [],
  providerSubtypes: [],
};

const source: MondayBoardSource = {
  id: "861",
  name: "Casa Prueba",
  columns: [
    { id: "name", title: "Name", type: "name" },
    { id: "area", title: "Área", type: "status" },
    { id: "depto", title: "Departamento", type: "dropdown" },
    { id: "fecha", title: "Fecha", type: "date" },
  ],
  subitemColumns: [{ id: "tipo", title: "Tipo", type: "text" }],
  groups: [
    { id: "g_a", title: "Diseño" },
    { id: "g_b", title: "Varios" },
  ],
  statusLabels: {},
  itemCount: 3,
  items: [],
  taskAreaValues: { area: ["diseno", "Obra", "Presale", "Otro"], depto: [], tipo: ["Render"] },
};

const board: BoardDraft = {
  mondayBoardId: "861",
  name: "Casa Prueba",
  strategy: "board_as_project",
  columns: {},
  statusMaps: {},
};

describe("task área source", () => {
  it("offers the board's dropdown, status and text columns; subitem ones on item_as_project", () => {
    expect(taskAreaColumns(board, source).map((c) => c.id)).toEqual(["area", "depto"]);
    expect(taskAreaColumns({ ...board, strategy: "item_as_project" }, source).map((c) => c.id)).toEqual(["tipo"]);
  });

  it("round-trips the source select", () => {
    for (const value of ["board", "group", "column:area"])
      expect(encodeTaskAreaSource(decodeTaskAreaSource(value))).toBe(value);
    expect(encodeTaskAreaSource(undefined)).toBe("board");
  });

  it("lists the values of the chosen source", () => {
    expect(taskAreaValues(board, source)).toEqual([]);
    expect(taskAreaValues({ ...board, taskAreaSource: { kind: "group" } }, source)).toEqual([
      { key: "g_a", label: "Diseño" },
      { key: "g_b", label: "Varios" },
    ]);
    expect(taskAreaValues({ ...board, taskAreaSource: { kind: "column", columnId: "area" } }, source)).toHaveLength(4);
  });
});

describe("pre-fill by name", () => {
  it("matches an área and its workflow of the same name, ignoring case and accents", () => {
    expect(suggestTaskArea("diseno", choices)).toEqual({ action: "area", areaId: "a-diseno", workflowId: "w-diseno" });
  });

  it("takes the área's only workflow, and the área owning a workflow named like the value", () => {
    expect(suggestTaskArea("Construcción", choices)).toEqual({ action: "area", areaId: "a-obra", workflowId: "w-obra" });
    expect(suggestTaskArea("Obra", choices)).toEqual({ action: "area", areaId: "a-obra", workflowId: "w-obra" });
    expect(suggestTaskArea("Render", choices)).toEqual({ action: "area", areaId: "a-diseno", workflowId: "w-render" });
  });

  it("leaves the workflow empty when the área has several and none is named alike, and skips unknown names", () => {
    expect(suggestTaskArea("Presale", choices)).toEqual({ action: "area", areaId: "a-libre", workflowId: null });
    expect(suggestTaskArea("Otro", choices)).toBeNull();
  });

  it("pre-fills every value when the source changes and drops the old source's targets", () => {
    const withOld = setTaskAreaTarget(board, "stale", { action: "ignore" });
    const next = setTaskAreaSource(withOld, { kind: "column", columnId: "area" }, source, choices);
    expect(next.taskAreaSource).toEqual({ kind: "column", columnId: "area" });
    expect(Object.keys(next.taskAreas ?? {}).sort()).toEqual(["Obra", "Presale", "diseno"]);
    expect(unmappedTaskAreaValues(next, source)).toEqual(["Otro"]);
    expect(setTaskAreaSource(next, { kind: "board" }, source, choices).taskAreas).toEqual({});
  });
});

describe("value targets", () => {
  it("only offers the área's workflows when it has any", () => {
    expect(workflowsForArea("a-obra", choices).map((w) => w.id)).toEqual(["w-obra"]);
    expect(workflowsForArea("a-libre", choices)).toHaveLength(3);
  });

  it("decodes the área select: área, Crear área, Ignorar and Sin equivalente", () => {
    const current = { action: "area" as const, areaId: "a-diseno", workflowId: "w-render" };
    expect(decodeTaskAreaChoice("a-obra", "Obra", current, choices)).toEqual({
      action: "area",
      areaId: "a-obra",
      workflowId: "w-obra",
    });
    expect(decodeTaskAreaChoice("a-diseno", "Diseño", current, choices)).toEqual(current);
    expect(decodeTaskAreaChoice(CREATE_AREA, " Mantenimiento ", current, choices)).toEqual({
      action: "create_area",
      name: "Mantenimiento",
      workflowId: "w-render",
    });
    expect(decodeTaskAreaChoice(IGNORE, "x", current, choices)).toEqual({ action: "ignore" });
    expect(decodeTaskAreaChoice(UNMAPPED, "x", current, choices)).toBeNull();
  });

  it("encodes each target for the área select", () => {
    expect(encodeTaskAreaChoice(undefined)).toBe(UNMAPPED);
    expect(encodeTaskAreaChoice({ action: "ignore" })).toBe(IGNORE);
    expect(encodeTaskAreaChoice({ action: "create_area", name: "X", workflowId: null })).toBe(CREATE_AREA);
    expect(encodeTaskAreaChoice({ action: "area", areaId: "a-obra", workflowId: null })).toBe("a-obra");
  });

  it("sets and clears one value", () => {
    const set = setTaskAreaTarget(board, "Obra", { action: "ignore" });
    expect(set.taskAreas).toEqual({ Obra: { action: "ignore" } });
    expect(setTaskAreaTarget(set, "Obra", null).taskAreas).toEqual({});
  });
});

describe("Vista previa problems (#686)", () => {
  it("writes the área issues in Spanish and sends them to Equivalencias", () => {
    const unmapped = 'Task área value "Mantenimiento" has no área; its tasks keep the board\'s workflow';
    expect(issueText("AREA_UNMAPPED", unmapped)).toContain("«Mantenimiento»");
    expect(
      issueText("AREA_NAME_TAKEN", 'An área named "Decoración" exists already; map the value to it instead of creating it'),
    ).toMatch(/^Ya existe un área llamada «Decoración»/);
    expect(issueText("MAPPING_INVALID", "taskAreas.Obra: area a1 does not exist")).toMatch(/Área y workflow de las tareas/);
    expect(ISSUE_FIX_STEP.AREA_UNMAPPED).toBe("equivalencias");
    expect(ISSUE_FIX_STEP.AREA_NAME_TAKEN).toBe("equivalencias");
  });
});
