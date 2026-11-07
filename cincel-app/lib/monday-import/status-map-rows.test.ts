import { describe, expect, it } from "vitest";

import {
  defaultStatusMapEntry,
  isMissingCustomStatus,
  setStatusMapEntry,
  statusMapLabels,
  statusMapRows,
} from "@/lib/monday-import/status-map";
import { COLUMN_TARGET_LABELS } from "@/lib/monday-import/wizard-steps";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import type { MondayBoardSource, MondayExportSource, MondayImportChoices } from "@/lib/types/monday-import";

const CANCELADO = "11111111-1111-4111-8111-111111111111";
const EN_ESPERA = "22222222-2222-4222-8222-222222222222";

const statuses: MondayImportChoices["statuses"] = [
  { id: CANCELADO, name: "Cancelado", closes: true, countsAsCompleted: false },
  { id: EN_ESPERA, name: "En espera", closes: false, countsAsCompleted: false },
];

function board(id: string, labels: MondayBoardSource["statusLabels"][string]): MondayBoardSource {
  return {
    id,
    name: `Tablero ${id}`,
    columns: [{ id: "status", title: "Estado", type: "status" }],
    subitemColumns: [],
    groups: [],
    statusLabels: { status: labels },
    itemCount: 0,
    items: [],
  };
}

const source: MondayExportSource = {
  boards: [
    board("b1", [
      { id: "0", name: "En Proceso", isDone: false, items: 4 },
      { id: "1", name: "Entregado", isDone: true, items: 6 },
    ]),
    board("b2", [
      { id: "0", name: "en  proceso", isDone: false, items: 2 },
      { id: "1", name: "Raro", isDone: false },
    ]),
    board("b3", [{ id: "0", name: "Solo aquí", isDone: false, items: 1 }]),
  ],
  users: [],
  hasFiles: false,
  hasUpdates: false,
};

const mapping: MappingInput = {
  version: 2,
  boards: [
    { mondayBoardId: "b1", name: "Uno", strategy: "board_as_project", columns: { status: "status" } },
    { mondayBoardId: "b2", name: "Dos", strategy: "group_as_project", columns: { status: "status" } },
    { mondayBoardId: "b3", name: "Tres", strategy: "skip", columns: { status: "status" } },
  ],
  people: {},
  options: {},
};

describe("firm-wide status map rows (FE §4.6 item 5)", () => {
  it("lists each monday label once across the boards, by statusLabelKey, adding up its items", () => {
    expect(statusMapLabels(mapping, source)).toEqual([
      { key: "en proceso", name: "En Proceso", items: 6, isDone: false },
      { key: "entregado", name: "Entregado", items: 6, isDone: true },
      { key: "raro", name: "Raro", items: null, isDone: false },
    ]);
  });

  it("narrows the labels to one board for its sheet and skips boards that aren't imported", () => {
    expect(statusMapLabels(mapping, source, "b2").map((label) => label.key)).toEqual(["en proceso", "raro"]);
    expect(statusMapLabels(mapping, source, "b3")).toEqual([]);
  });

  it("only reads the columns mapped to Estatus", () => {
    const noStatus = { ...mapping, boards: mapping.boards.map((b) => ({ ...b, columns: { status: "ignore" as const } })) };
    expect(statusMapLabels(noStatus, source)).toEqual([]);
  });

  it("prefills the defaults table, resolving Cancelado and En espera to the firm's statuses by name", () => {
    expect(defaultStatusMapEntry("En Proceso", statuses)).toEqual({
      entry: { target: { status: "en_proceso" }, priority: null },
      defaulted: false,
    });
    expect(defaultStatusMapEntry("Confirmado", statuses).entry.target).toEqual({ status: "completado" });
    expect(defaultStatusMapEntry("No se Requiere", statuses).entry.target).toEqual({ customStatusId: CANCELADO });
    expect(defaultStatusMapEntry("En espera", statuses).entry.target).toEqual({ customStatusId: EN_ESPERA });
    expect(defaultStatusMapEntry("Siguiente Paso", statuses).entry).toEqual({
      target: { status: "pendiente" },
      priority: "alta",
    });
    expect(defaultStatusMapEntry("-", statuses)).toEqual({
      entry: { target: { status: "pendiente" }, priority: null },
      defaulted: false,
    });
  });

  it("starts unknown labels as Pendiente flagged «Sin equivalente», also when a seeded status is missing", () => {
    expect(defaultStatusMapEntry("Raro", statuses)).toEqual({
      entry: { target: { status: "pendiente" }, priority: null },
      defaulted: true,
    });
    expect(defaultStatusMapEntry("Cancelado", []).defaulted).toBe(true);
  });

  it("keeps a saved choice over the default", () => {
    const labels = statusMapLabels(mapping, source);
    const rows = statusMapRows(labels, { raro: { target: { status: "bloqueado" }, priority: "baja" } }, statuses);
    expect(rows.map((row) => [row.key, row.entry, row.defaulted])).toEqual([
      ["en proceso", { target: { status: "en_proceso" }, priority: null }, false],
      ["entregado", { target: { status: "completado" }, priority: null }, false],
      ["raro", { target: { status: "bloqueado" }, priority: "baja" }, false],
    ]);
  });

  it("detects a saved custom status the firm no longer has", () => {
    expect(isMissingCustomStatus({ customStatusId: CANCELADO }, statuses)).toBe(false);
    expect(isMissingCustomStatus({ customStatusId: "33333333-3333-4333-8333-333333333333" }, statuses)).toBe(true);
    expect(isMissingCustomStatus({ status: "pendiente" }, [])).toBe(false);
  });

  it("sets one entry without touching the rest", () => {
    const map = { a: { target: { status: "pendiente" as const }, priority: null } };
    expect(setStatusMapEntry(map, "b", { target: { status: "completado" }, priority: "alta" })).toEqual({
      ...map,
      b: { target: { status: "completado" }, priority: "alta" },
    });
  });
});

describe("date column targets (FE §4.6 item 6)", () => {
  it("offers Línea de tiempo for both dates and Fecha que finalizó", () => {
    expect(COLUMN_TARGET_LABELS.timeline).toBe("Línea de tiempo → compromiso y entrega");
    expect(COLUMN_TARGET_LABELS.closed_date).toBe("Fecha que finalizó");
  });
});
