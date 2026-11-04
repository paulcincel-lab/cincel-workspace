// @vitest-environment node
/** Missing clients on Equivalencias, the empty Nuevo contacto name and the clickable step chips (#679). */
import { describe, expect, it } from "vitest";

import {
  boardsWithoutClient,
  canJumpTo,
  decodeClient,
  lacksClient,
  needsClient,
  type BoardDraft,
  type WizardState,
} from "@/lib/monday-import/wizard-steps";
import type { MondayBoardSource, MondayExportSource, MondayImportRunState } from "@/lib/types/monday-import";
import type { MappingInput } from "@/scripts/monday/mapping.schema";

const ACME = "00000000-0000-4000-8000-0000000000e5";

function board(overrides: Partial<BoardDraft>): BoardDraft {
  return {
    mondayBoardId: "1",
    name: "Proyectos",
    strategy: "board_as_project",
    columns: {},
    statusMaps: {},
    ...overrides,
  } as BoardDraft;
}

function boardSource(id: string, groups: string[]): MondayBoardSource {
  return {
    id,
    name: `Tablero ${id}`,
    columns: [],
    subitemColumns: [],
    groups: groups.map((g) => ({ id: g, title: `Grupo ${g}` })),
    statusLabels: {},
    itemCount: 0,
    items: [],
  };
}

function run(overrides: Partial<MondayImportRunState> = {}): MondayImportRunState {
  return {
    runId: "run-1",
    createdAt: "2026-11-04T00:00:00.000Z",
    updatedAt: "2026-11-04T00:00:00.000Z",
    step: "vista_previa",
    account: null,
    boardIds: ["1"],
    exportOptions: { updates: true, files: true },
    exported: true,
    mapping: null,
    jobs: {},
    batchId: null,
    batchStatus: null,
    ...overrides,
  } as MondayImportRunState;
}

const state = (r: MondayImportRunState | null): WizardState => ({
  connection: null,
  run: r,
  selectedBoardIds: [],
  mapping: null,
  preview: null,
});

describe("Nuevo contacto", () => {
  it("starts with an empty name instead of the board's", () => {
    expect(decodeClient("new")).toEqual({ kind: "new", name: "", contactKind: "empresa" });
  });
});

describe("missing clients", () => {
  it("only project strategies need a client", () => {
    expect(needsClient("board_as_project")).toBe(true);
    expect(needsClient("group_as_project")).toBe(true);
    expect(needsClient("item_as_project")).toBe(true);
    expect(needsClient("crm_contacts")).toBe(false);
    expect(needsClient("skip")).toBe(false);
  });

  it("flags a project board with Sin cliente, not one with a client or a CRM board", () => {
    expect(lacksClient(board({ client: null }))).toBe(true);
    expect(lacksClient(board({ strategy: "item_as_project" }))).toBe(true);
    expect(lacksClient(board({ client: { kind: "contact", contactId: ACME } }))).toBe(false);
    expect(lacksClient(board({ client: { kind: "relation_column", columnId: "cliente" } }))).toBe(false);
    expect(lacksClient(board({ strategy: "crm_contacts", client: null }))).toBe(false);
    expect(lacksClient(board({ strategy: "skip", client: null }))).toBe(false);
  });

  it("on group_as_project, flags the board only while some group has no client of its own", () => {
    const groups = boardSource("1", ["g1", "g2"]);
    const contact = { kind: "contact" as const, contactId: ACME };
    expect(lacksClient(board({ strategy: "group_as_project", groupClients: { g1: contact } }), groups)).toBe(true);
    expect(
      lacksClient(board({ strategy: "group_as_project", groupClients: { g1: contact, g2: contact } }), groups),
    ).toBe(false);
    expect(lacksClient(board({ strategy: "group_as_project", client: contact }), groups)).toBe(false);
  });

  it("lists the boards without a client", () => {
    const mapping = {
      version: 1,
      boards: [
        board({ mondayBoardId: "1", name: "Casas" }),
        board({ mondayBoardId: "2", name: "Clientes", strategy: "crm_contacts" }),
        board({ mondayBoardId: "3", name: "Obras", client: { kind: "contact", contactId: ACME } }),
      ],
      people: {},
      options: {},
    } as unknown as MappingInput;
    const source = { boards: [boardSource("1", []), boardSource("2", []), boardSource("3", [])] } as MondayExportSource;
    expect(boardsWithoutClient(mapping, source).map((b) => b.name)).toEqual(["Casas"]);
  });
});

describe("step chips", () => {
  it("opens finished steps only", () => {
    expect(canJumpTo("equivalencias", "vista_previa", state(run()))).toBe(true);
    expect(canJumpTo("conectar", "vista_previa", state(run()))).toBe(true);
    expect(canJumpTo("vista_previa", "vista_previa", state(run()))).toBe(false);
    expect(canJumpTo("importar", "vista_previa", state(run()))).toBe(false);
  });

  it("stays put while a job runs, once the import is applied or without a run", () => {
    const running = {
      kind: "export" as const,
      status: "running" as const,
      startedAt: "2026-11-04T00:00:00.000Z",
      finishedAt: null,
      progress: { done: 0, total: null, label: "Exportando tableros" },
      log: [],
      error: null,
    };
    expect(canJumpTo("tableros", "equivalencias", state(run({ jobs: { export: running } })))).toBe(false);
    expect(canJumpTo("vista_previa", "importar", state(run({ batchId: "b1" })))).toBe(false);
    expect(canJumpTo("tableros", "equivalencias", state(null))).toBe(false);
  });
});
