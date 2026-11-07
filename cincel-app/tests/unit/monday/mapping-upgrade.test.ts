// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  Mapping,
  upgradeMappingV1,
  type MappingUpgradeExport,
  type MappingUpgradeLookups,
} from "@/scripts/monday/mapping.schema";

const TRAMO_DISENO = "6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const TRAMO_OBRA = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const FASE_PLANOS = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const FASE_RENDERS = "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f";
const FASE_ACABADOS_DISENO = "4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f8a";
const FASE_ACABADOS_OBRA = "5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8a9b";
const FASE_CIMENTACION = "6f7a8b9c-0d1e-4f2a-9b4c-5d6e7f8a9b0c";
const CUSTOM_ESPERA = "7a8b9c0d-1e2f-4a3b-8c5d-6e7f8a9b0c1d";
const AREA = "8b9c0d1e-2f3a-4b4c-9d6e-7f8a9b0c1d2e";

function lookups(statusMap: MappingUpgradeLookups["statusMap"] = {}): MappingUpgradeLookups {
  return {
    phases: {
      [FASE_PLANOS]: { workflowId: TRAMO_DISENO, name: "Planos" },
      [FASE_RENDERS]: { workflowId: TRAMO_DISENO, name: "Renders" },
      [FASE_ACABADOS_DISENO]: { workflowId: TRAMO_DISENO, name: "Acabados" },
      [FASE_ACABADOS_OBRA]: { workflowId: TRAMO_OBRA, name: "Acabados" },
      [FASE_CIMENTACION]: { workflowId: TRAMO_OBRA, name: "Cimentación" },
    },
    statusMap,
  };
}

const statusSettings = {
  labels: [
    { id: 0, label: "Listo" },
    { id: 1, label: "Trabajando en ello" },
    { id: 2, label: "Detenido" },
    { id: 5, label: "En espera" },
  ],
};

function exportData(): MappingUpgradeExport {
  return {
    boards: [
      {
        board: {
          id: "100",
          groups: [
            { id: "g_cim", title: "Cimentación" },
            { id: "g_acab", title: "Acabados" },
            { id: "g_otro", title: "Varios" },
          ],
          columns: [
            { id: "status", settings: statusSettings },
            { id: "name", settings: null },
          ],
          subitem_columns: [{ id: "status_sub", settings: { labels: { "0": "Hecho", "1": "Pendiente" } } }],
        },
      },
      {
        board: {
          id: "200",
          groups: [],
          columns: [{ id: "estado", settings: { labels: { "0": " listo ", "3": "Detenido", "7": "Nuevo" } } }],
        },
      },
    ],
  };
}

function v1Board(overrides: Record<string, unknown> = {}) {
  return {
    mondayBoardId: "100",
    name: "Casa Lomas",
    strategy: "board_as_project",
    areaId: AREA,
    workflowId: TRAMO_DISENO,
    columns: { name: "title", status: "status" },
    statusMaps: {},
    taskAreaSource: { kind: "group" },
    taskAreas: { g_cim: { action: "area", areaId: AREA, workflowId: null } },
    ...overrides,
  };
}

function v1Mapping(boards: Record<string, unknown>[]) {
  return {
    version: 1,
    boards,
    people: { "11": { action: "ignore" } },
    options: { includeUpdates: true, includeFiles: false },
  };
}

function upgradeTargets(groupTargets: Record<string, unknown>, workflowId: string | null = TRAMO_DISENO) {
  const result = upgradeMappingV1(
    v1Mapping([v1Board({ groupTargets, workflowId })]),
    lookups(),
    exportData(),
  );
  return { targets: result.mapping.boards[0].groupTargets, notes: result.notes };
}

describe("upgradeMappingV1: group kinds", () => {
  it("stage → tramo", () => {
    const { targets, notes } = upgradeTargets({ g: { kind: "stage", workflowId: TRAMO_OBRA } });
    expect(targets.g).toEqual({ kind: "tramo", workflowId: TRAMO_OBRA });
    expect(notes).toEqual([]);
  });

  it("workflow_phase → the fase of that name in the board's tramo", () => {
    const { targets } = upgradeTargets({ g: { kind: "workflow_phase", phase: "acabados" } });
    // "Acabados" exists in both tramos; the board's tramo decides.
    expect(targets.g).toEqual({ kind: "phase", phaseId: FASE_ACABADOS_DISENO });
  });

  it("workflow_phase without a fase of that name → the board's tramo", () => {
    const { targets } = upgradeTargets({ g: { kind: "workflow_phase", phase: "Cimentación" } });
    expect(targets.g).toEqual({ kind: "tramo", workflowId: TRAMO_DISENO });
  });

  it("workflow_phase on a board without tramo is dropped and reported", () => {
    const { targets, notes } = upgradeTargets({ g: { kind: "workflow_phase", phase: "Planos" } }, null);
    expect(targets.g).toBeUndefined();
    expect(notes).toEqual([{ kind: "group_target_dropped", boardId: "100", groupId: "g", from: "workflow_phase" }]);
  });

  it("phase → the fase named like the group when exactly one tramo has it (accents ignored)", () => {
    const { targets } = upgradeTargets({ g_cim: { kind: "phase" } });
    expect(targets.g_cim).toEqual({ kind: "phase", phaseId: FASE_CIMENTACION });
  });

  it("phase with an ambiguous or unknown name → the board's tramo", () => {
    const { targets } = upgradeTargets({ g_acab: { kind: "phase" }, g_otro: { kind: "phase" }, g_gone: { kind: "phase" } });
    expect(targets.g_acab).toEqual({ kind: "tramo", workflowId: TRAMO_DISENO });
    expect(targets.g_otro).toEqual({ kind: "tramo", workflowId: TRAMO_DISENO });
    expect(targets.g_gone).toEqual({ kind: "tramo", workflowId: TRAMO_DISENO });
  });

  it("phase on a board without tramo and no unique fase is dropped and reported", () => {
    const { targets, notes } = upgradeTargets({ g_otro: { kind: "phase" } }, null);
    expect(targets.g_otro).toBeUndefined();
    expect(notes).toEqual([{ kind: "group_target_dropped", boardId: "100", groupId: "g_otro", from: "phase" }]);
  });

  it("project and ignore stay", () => {
    const { targets } = upgradeTargets({ a: { kind: "project" }, b: { kind: "ignore" } });
    expect(targets).toEqual({ a: { kind: "project" }, b: { kind: "ignore" } });
  });
});

describe("upgradeMappingV1: mapping", () => {
  it("returns a valid v2 mapping without the removed fields", () => {
    const { mapping } = upgradeMappingV1(
      v1Mapping([v1Board({ projectCode: "CL-01", templateMatches: { "5001": FASE_PLANOS } })]),
      lookups(),
      exportData(),
    );
    expect(mapping.version).toBe(2);
    expect(Mapping.safeParse(mapping).success).toBe(true);
    const board = mapping.boards[0] as Record<string, unknown>;
    for (const removed of ["areaId", "taskAreaSource", "taskAreas", "statusMaps"]) {
      expect(board).not.toHaveProperty(removed);
    }
    expect(board.workflowId).toBe(TRAMO_DISENO);
    expect(board.projectCode).toBe("CL-01");
    expect(mapping.people).toEqual({ "11": { action: "ignore" } });
    expect(mapping.options).toEqual({ includeUpdates: true, includeFiles: false });
  });

  it("returns a v2 mapping as it is", () => {
    const v2 = {
      version: 2,
      boards: [{ mondayBoardId: "100", name: "X", strategy: "skip", columns: {} }],
      people: {},
      options: {},
      statusMap: { listo: { target: { status: "completado" }, priority: null } },
    };
    const saved = { hecho: { target: { status: "completado" as const }, priority: null } };
    const result = upgradeMappingV1(v2, lookups(saved), exportData());
    expect(result.mapping).toEqual(Mapping.parse(v2));
    expect(result.statusMap).toEqual(saved);
    expect(result.notes).toEqual([]);
  });

  it("throws on a file that is neither v1 nor v2", () => {
    expect(() => upgradeMappingV1({ version: 3 }, lookups(), exportData())).toThrow();
    expect(() => upgradeMappingV1(null, lookups(), exportData())).toThrow();
  });
});

describe("upgradeMappingV1: status map merge", () => {
  it("merges label texts from the export, keyed by statusLabelKey, with null priority", () => {
    const { statusMap, mapping, notes } = upgradeMappingV1(
      v1Mapping([
        v1Board({
          statusMaps: {
            status: {
              "0": { status: "completado" },
              "1": { status: "en_proceso" },
              "5": { customStatusId: CUSTOM_ESPERA },
            },
            status_sub: { "0": { status: "completado" } },
          },
        }),
      ]),
      lookups(),
      exportData(),
    );
    expect(statusMap).toEqual({
      listo: { target: { status: "completado" }, priority: null },
      "trabajando en ello": { target: { status: "en_proceso" }, priority: null },
      "en espera": { target: { customStatusId: CUSTOM_ESPERA }, priority: null },
      hecho: { target: { status: "completado" }, priority: null },
    });
    expect(mapping.statusMap).toEqual(statusMap);
    expect(notes).toEqual([]);
  });

  it("keeps the saved map's entries and only adds missing labels", () => {
    const saved = {
      listo: { target: { status: "en_proceso" as const }, priority: "alta" as const },
    };
    const { statusMap } = upgradeMappingV1(
      v1Mapping([
        v1Board({ statusMaps: { status: { "0": { status: "completado" }, "2": { status: "bloqueado" } } } }),
      ]),
      lookups(saved),
      exportData(),
    );
    expect(statusMap).toEqual({
      listo: { target: { status: "en_proceso" }, priority: "alta" },
      detenido: { target: { status: "bloqueado" }, priority: null },
    });
  });

  it("merges across boards: the first board wins a conflicting label, which is reported", () => {
    const { statusMap, notes } = upgradeMappingV1(
      v1Mapping([
        v1Board({ statusMaps: { status: { "0": { status: "completado" }, "2": { status: "bloqueado" } } } }),
        v1Board({
          mondayBoardId: "200",
          name: "Obra Roma",
          columns: { estado: "status" },
          statusMaps: {
            estado: {
              // " listo " has the same key as "Listo" and the same target: no conflict.
              "0": { status: "completado" },
              // "Detenido" → a different target than board 100 gave it.
              "3": { customStatusId: CUSTOM_ESPERA },
              "7": { status: "pendiente" },
            },
          },
        }),
      ]),
      lookups(),
      exportData(),
    );
    expect(statusMap).toEqual({
      listo: { target: { status: "completado" }, priority: null },
      detenido: { target: { status: "bloqueado" }, priority: null },
      nuevo: { target: { status: "pendiente" }, priority: null },
    });
    expect(notes).toEqual([
      {
        kind: "status_label_conflict",
        boardId: "200",
        columnId: "estado",
        labelId: "3",
        key: "detenido",
        kept: { status: "bloqueado" },
        dropped: { customStatusId: CUSTOM_ESPERA },
      },
    ]);
  });

  it("skips and reports label ids the export doesn't define", () => {
    const { statusMap, notes } = upgradeMappingV1(
      v1Mapping([
        v1Board({
          statusMaps: {
            status: { "0": { status: "completado" }, "9": { status: "bloqueado" } },
            gone_column: { "1": { status: "en_proceso" } },
          },
        }),
        v1Board({ mondayBoardId: "999", name: "Sin export", statusMaps: { status: { "0": { status: "pendiente" } } } }),
      ]),
      lookups(),
      exportData(),
    );
    expect(statusMap).toEqual({ listo: { target: { status: "completado" }, priority: null } });
    expect(notes).toEqual([
      { kind: "status_label_unknown", boardId: "100", columnId: "status", labelId: "9" },
      { kind: "status_label_unknown", boardId: "100", columnId: "gone_column", labelId: "1" },
      { kind: "status_label_unknown", boardId: "999", columnId: "status", labelId: "0" },
    ]);
  });

  it("doesn't carry over targets init drafted without an equivalent", () => {
    const { statusMap, notes } = upgradeMappingV1(
      v1Mapping([v1Board({ statusMaps: { status: { "1": { status: "pendiente", defaulted: true } } } })]),
      lookups(),
      exportData(),
    );
    expect(statusMap).toEqual({});
    expect(notes).toEqual([]);
  });
});
