// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  applyGroupAsProject,
  currentGroupTarget,
  decodeGroupTarget,
  encodeGroupTarget,
  groupTargetChoices,
  ownProjectGroups,
  pruneGroupTargets,
  setGroupTarget,
  suggestsGroupAsProject,
} from "@/lib/monday-import/group-targets";
import { projectKeys, setBoardWorkflow, type BoardDraft } from "@/lib/monday-import/wizard-steps";
import { groupsLookLikeClients, resolveGroupTarget, workflowPhaseNames } from "@/scripts/monday/group-targets";
import type { GroupTarget } from "@/scripts/monday/mapping.schema";
import type { MondayBoardSource, MondayImportChoices } from "@/lib/types/monday-import";

const DISENO = "11111111-1111-4111-8111-111111111111";
const OBRA = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";

const choices: MondayImportChoices = {
  statuses: [],
  areas: [],
  workflows: [
    { id: DISENO, name: "Diseño" },
    { id: OBRA, name: "Construcción" },
  ],
  templates: [
    { id: "t1", workflowId: DISENO, name: "Planos", phase: "Anteproyecto" },
    { id: "t2", workflowId: DISENO, name: "Renders", phase: " anteproyecto " },
    { id: "t3", workflowId: DISENO, name: "Ejecutivo", phase: "Proyecto ejecutivo" },
    { id: "t4", workflowId: OBRA, name: "Cimentación", phase: "Obra negra" },
    { id: "t5", workflowId: OBRA, name: "Limpieza", phase: null },
  ],
  clients: [
    { id: CLIENT, name: "Familia Pérez" },
    { id: "44444444-4444-4444-8444-444444444444", name: "Grupo Norte" },
  ],
  staff: [],
  providerSubtypes: [],
};

const source: MondayBoardSource = {
  id: "301",
  name: "Casa Lomas",
  columns: [],
  subitemColumns: [],
  groups: [
    { id: "g_ante", title: "Anteproyecto" },
    { id: "g_extra", title: "Extras" },
  ],
  statusLabels: {},
  itemCount: 0,
  items: [],
};

function board(overrides: Partial<BoardDraft> = {}): BoardDraft {
  return {
    mondayBoardId: "301",
    name: "Casa Lomas",
    strategy: "board_as_project",
    workflowId: DISENO,
    columns: {},
    statusMaps: {},
    ...overrides,
  };
}

describe("group targets (#687)", () => {
  it("workflow phases come from the workflow's templates, trimmed and deduplicated", () => {
    expect(workflowPhaseNames(choices.templates, DISENO)).toEqual(["Anteproyecto", "Proyecto ejecutivo"]);
    expect(workflowPhaseNames(choices.templates, OBRA)).toEqual(["Obra negra"]);
    expect(workflowPhaseNames(choices.templates, null)).toEqual([]);
  });

  it("encodes and decodes every target", () => {
    const targets: GroupTarget[] = [
      { kind: "phase" },
      { kind: "workflow_phase", phase: "Obra negra" },
      { kind: "stage", workflowId: OBRA },
      { kind: "project" },
      { kind: "ignore" },
    ];
    for (const target of targets) expect(decodeGroupTarget(encodeGroupTarget(target))).toEqual(target);
    expect(decodeGroupTarget("workflow_phase: ")).toBeNull();
    expect(decodeGroupTarget("otra")).toBeNull();
  });

  it("defaults to the workflow phase of the same name, else a new phase; a choice wins", () => {
    expect(currentGroupTarget(board(), source.groups[0], choices)).toEqual({
      kind: "workflow_phase",
      phase: "Anteproyecto",
    });
    expect(currentGroupTarget(board(), source.groups[1], choices)).toEqual({ kind: "phase" });
    const chosen = board({ groupTargets: { g_ante: { kind: "ignore" } } });
    expect(currentGroupTarget(chosen, source.groups[0], choices)).toEqual({ kind: "ignore" });
  });

  it("a choice the strategy doesn't offer falls back to the default", () => {
    const items = board({ strategy: "item_as_project", groupTargets: { g_extra: { kind: "project" } } });
    expect(resolveGroupTarget(items, source.groups[1], [])).toEqual({ kind: "phase" });
  });

  it("offers workflow phases, other stages, a new phase, its own project and ignore", () => {
    expect(groupTargetChoices(board(), source.groups[1], choices)).toEqual([
      { value: "workflow_phase:Anteproyecto", label: "Fase «Anteproyecto» de Diseño" },
      { value: "workflow_phase:Proyecto ejecutivo", label: "Fase «Proyecto ejecutivo» de Diseño" },
      { value: `stage:${OBRA}`, label: "Etapa «Construcción»" },
      { value: "phase", label: "Fase nueva «Extras» del proyecto" },
      { value: "project", label: "Proyecto propio «Extras»" },
      { value: "ignore", label: "No importar" },
    ]);
    const items = groupTargetChoices(board({ strategy: "item_as_project" }), source.groups[1], choices);
    expect(items.map((choice) => choice.value)).not.toContain("project");
    expect(groupTargetChoices(board({ strategy: "group_as_project" }), source.groups[1], choices)).toEqual([]);
  });

  it("leaving its own project drops the group's client, name and code", () => {
    const own = setGroupTarget(
      board({ projectNames: { g_extra: "Extras" }, projectCodes: { g_extra: "EX" } }),
      "g_extra",
      { kind: "project" },
    );
    const withClient: BoardDraft = { ...own, groupClients: { g_extra: { kind: "contact", contactId: CLIENT } } };
    expect(ownProjectGroups(withClient, source).map((group) => group.id)).toEqual(["g_extra"]);
    expect(projectKeys(withClient, source).map((key) => key.id)).toEqual(["301", "g_extra"]);

    const back = setGroupTarget(withClient, "g_extra", { kind: "phase" });
    expect(back.groupClients).toEqual({});
    expect(back.projectNames).toEqual({});
    expect(back.projectCodes).toEqual({});
    expect(projectKeys(back, source).map((key) => key.id)).toEqual(["301"]);
  });

  it("changing the workflow drops phases the new workflow doesn't have", () => {
    const draft = board({
      groupTargets: {
        g_ante: { kind: "workflow_phase", phase: "Anteproyecto" },
        g_extra: { kind: "stage", workflowId: OBRA },
      },
    });
    expect(pruneGroupTargets(draft, choices)).toBe(draft);
    expect(setBoardWorkflow(draft, OBRA, choices).groupTargets).toEqual({
      g_extra: { kind: "stage", workflowId: OBRA },
    });
  });

  it("suggests Grupo como proyecto when most groups are named like clients", () => {
    const clientsBoard: MondayBoardSource = {
      ...source,
      groups: [
        { id: "g1", title: "familia perez" },
        { id: "g2", title: "Grupo  Norte" },
        { id: "g3", title: "Pendientes" },
      ],
    };
    expect(groupsLookLikeClients(clientsBoard.groups, choices.clients)).toBe(true);
    expect(groupsLookLikeClients(source.groups, choices.clients)).toBe(false);
    expect(groupsLookLikeClients([{ title: "Familia Pérez" }], choices.clients)).toBe(false);
    expect(suggestsGroupAsProject(board(), clientsBoard, choices)).toBe(true);
    expect(suggestsGroupAsProject(board({ strategy: "group_as_project" }), clientsBoard, choices)).toBe(false);

    const applied = applyGroupAsProject(
      board({ groupTargets: { g3: { kind: "ignore" } } }),
      clientsBoard,
      choices,
    );
    expect(applied.strategy).toBe("group_as_project");
    expect(applied.groupTargets).toEqual({});
    expect(applied.groupClients).toEqual({
      g1: { kind: "contact", contactId: CLIENT },
      g2: { kind: "contact", contactId: "44444444-4444-4444-8444-444444444444" },
    });
  });
});
