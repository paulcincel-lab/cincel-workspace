import { describe, expect, it } from "vitest";

import type { TaskListRow, TaskStatusOption } from "@/lib/types/core";

import {
  boardOfColumns,
  columnKeyOfRow,
  emptyBoardColumns,
  listItemOfRow,
  moveBoardCard,
  movedRow,
  type TareasBoardData,
} from "./page-data";

function row(id: string, overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id,
    status: "pendiente",
    customStatus: null,
    title: `Tarea ${id}`,
    project: { id: "p1", name: "Casa", clientName: null },
    ...overrides,
  } as TaskListRow;
}

const QA: TaskStatusOption = { id: "cs-qa", name: "QA", closes: false, countsAsCompleted: false, sortOrder: 1 };
const CIERRE: TaskStatusOption = { id: "cs-cierre", name: "Cierre", closes: true, countsAsCompleted: true, sortOrder: 2 };

function board(): TareasBoardData {
  const columns = emptyBoardColumns([QA, CIERRE]);
  columns.pendiente = { rows: [row("a"), row("b")], total: 30, nextCursor: "c1" };
  columns.en_proceso = { rows: [row("c", { status: "en_proceso" })], total: 1, nextCursor: null };
  return { columns, statuses: [QA, CIERRE] };
}

describe("emptyBoardColumns", () => {
  it("has every base column and one per custom status, all with total 0 (#919)", () => {
    expect(emptyBoardColumns([QA])).toEqual({
      pendiente: { rows: [], total: 0, nextCursor: null },
      en_proceso: { rows: [], total: 0, nextCursor: null },
      completado: { rows: [], total: 0, nextCursor: null },
      bloqueado: { rows: [], total: 0, nextCursor: null },
      "custom:cs-qa": { rows: [], total: 0, nextCursor: null },
    });
  });
});

describe("movedRow", () => {
  it("a base column clears the custom status", () => {
    const moved = movedRow(row("a", { status: "en_proceso", customStatus: { ...QA } }), "bloqueado", [QA]);
    expect(moved).toMatchObject({ status: "bloqueado", customStatus: null });
  });

  it("a custom column sets it with the status underneath (closing → completado)", () => {
    expect(movedRow(row("a"), "custom:cs-qa", [QA, CIERRE])).toMatchObject({
      status: "en_proceso",
      customStatus: { id: "cs-qa", name: "QA", closes: false, countsAsCompleted: false },
    });
    expect(movedRow(row("a"), "custom:cs-cierre", [QA, CIERRE])?.status).toBe("completado");
  });

  it("is null for an unknown custom status", () => {
    expect(movedRow(row("a"), "custom:nope", [QA])).toBeNull();
  });
});

describe("moveBoardCard", () => {
  it("moves the card on top of the target column and adjusts both totals", () => {
    const next = moveBoardCard(board(), "b", "en_proceso");
    expect(next.columns.pendiente.rows.map((r) => r.id)).toEqual(["a"]);
    expect(next.columns.pendiente.total).toBe(29);
    expect(next.columns.pendiente.nextCursor).toBe("c1");
    expect(next.columns.en_proceso.rows.map((r) => r.id)).toEqual(["b", "c"]);
    expect(next.columns.en_proceso.total).toBe(2);
    expect(next.columns.en_proceso.rows[0].status).toBe("en_proceso");
  });

  it("moves into an empty custom column", () => {
    const next = moveBoardCard(board(), "a", "custom:cs-qa");
    expect(next.columns["custom:cs-qa"]).toMatchObject({ total: 1 });
    expect(columnKeyOfRow(next.columns["custom:cs-qa"].rows[0])).toBe("custom:cs-qa");
  });

  it("takes a card from a “Cargar más” page (not on the first rows)", () => {
    const extra = row("z");
    const next = moveBoardCard(board(), "z", "bloqueado", extra);
    expect(next.columns.pendiente.total).toBe(29);
    expect(next.columns.bloqueado.rows.map((r) => r.id)).toEqual(["z"]);
    expect(next.columns.bloqueado.total).toBe(1);
  });

  it("leaves the board unchanged for the same column or an unknown task", () => {
    const before = board();
    expect(moveBoardCard(before, "a", "pendiente")).toBe(before);
    expect(moveBoardCard(before, "nope", "bloqueado")).toBe(before);
    expect(moveBoardCard(before, "a", "custom:nope")).toBe(before);
  });

  it("never mutates the board it is given", () => {
    const before = board();
    const copy = structuredClone(before);
    moveBoardCard(before, "a", "completado");
    expect(before).toEqual(copy);
  });
});

describe("boardOfColumns / listItemOfRow", () => {
  it("groups every loaded row by its base status, as list items without notes", () => {
    const b = boardOfColumns({
      ...board().columns,
      "custom:cs-qa": { rows: [row("q", { status: "en_proceso", customStatus: { ...QA } })], total: 1, nextCursor: null },
    });
    expect(b.pendiente.map((t) => t.id)).toEqual(["a", "b"]);
    expect(b.en_proceso.map((t) => t.id).sort()).toEqual(["c", "q"]);
    expect(listItemOfRow(row("a")).notes).toBeNull();
  });
});
