// @vitest-environment node
/** Optional clients on Equivalencias, the empty Nuevo contacto name and the clickable step chips (#679). */
import { describe, expect, it } from "vitest";

import { canJumpTo, decodeClient, needsClient, validateMapping, type WizardState } from "@/lib/monday-import/wizard-steps";
import type { MondayImportRunState } from "@/lib/types/monday-import";
import type { MappingInput } from "@/scripts/monday/mapping.schema";

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

describe("optional clients (project flow)", () => {
  it("project strategies take a client; none of them requires one", () => {
    expect(needsClient("board_as_project")).toBe(true);
    expect(needsClient("group_as_project")).toBe(true);
    expect(needsClient("item_as_project")).toBe(true);
    expect(needsClient("crm_contacts")).toBe(false);
    expect(needsClient("skip")).toBe(false);
  });

  it("drafts without a client still validate", () => {
    const mapping = {
      version: 2,
      boards: [{ mondayBoardId: "1", name: "Casas", strategy: "board_as_project", columns: {}, client: null }],
      people: {},
      options: {},
    } as unknown as MappingInput;
    expect(validateMapping(mapping)).toEqual([]);
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
