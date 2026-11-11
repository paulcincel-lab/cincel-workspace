import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { TASK_SORT_COLUMNS, type TaskSortColumn } from "@/lib/tareas/sort";

import { columnSortParts, decodeColumnSortCursor, encodeColumnSortCursor } from "./tasks-repository";

const ID = "0b9c6f1e-4a3d-4c8e-9f2a-1d2e3f4a5b6c";

/** A valid key for a column: one value per part, in its type. */
function keyOf(column: TaskSortColumn): Array<number | string> {
  return columnSortParts(column).map((part) => {
    if (part.cast === "int") return part.fixed ? 1 : 3;
    if (part.cast === "date") return "2026-11-09";
    if (part.cast === "uuid") return ID;
    return "planos de obra";
  });
}

describe("column sort cursors (#1044)", () => {
  for (const column of TASK_SORT_COLUMNS) {
    it(`${column}: round-trips both ways, id last`, () => {
      const parts = columnSortParts(column);
      expect(parts.at(-1)?.cast).toBe("uuid");
      for (const dir of ["asc", "desc"] as const) {
        const key = keyOf(column);
        const cursor = encodeColumnSortCursor(column, dir, key);
        expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(decodeColumnSortCursor(cursor, column, dir)).toEqual(key);
        // Another direction's or column's cursor is not this one's.
        expect(() => decodeColumnSortCursor(cursor, column, dir === "asc" ? "desc" : "asc")).toThrow("INVALID: cursor");
      }
    });
  }

  it("puts empty values last both ways: the null flag ignores the direction", () => {
    for (const column of ["tramo", "fase", "responsable", "vence", "retraso"] as const) {
      const flags = columnSortParts(column).filter((p) => p.fixed);
      expect(flags).toHaveLength(1);
    }
    for (const column of ["titulo", "estatus", "prioridad", "subtareas"] as const) {
      expect(columnSortParts(column).some((p) => p.fixed)).toBe(false);
    }
  });

  it("rejects malformed cursors", () => {
    const bad = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
    expect(() => decodeColumnSortCursor("%%%", "vence", "asc")).toThrow("INVALID: cursor");
    expect(() => decodeColumnSortCursor(bad(["r", 0, "2026-11-09", ID]), "vence", "asc")).toThrow("INVALID: cursor");
    expect(() => decodeColumnSortCursor(bad(["s", "vence", "asc", 0, "nope", ID]), "vence", "asc")).toThrow("INVALID: cursor");
    expect(() => decodeColumnSortCursor(bad(["s", "vence", "asc", 0, "2026-11-09"]), "vence", "asc")).toThrow("INVALID: cursor");
    expect(() => decodeColumnSortCursor(bad(["s", "titulo", "asc", 5, ID]), "titulo", "asc")).toThrow("INVALID: cursor");
  });
});
