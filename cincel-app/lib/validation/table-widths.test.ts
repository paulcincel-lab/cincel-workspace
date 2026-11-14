import { describe, expect, it } from "vitest";

import { SetTableColumnWidthsSchema } from "@/lib/validation/table-widths";

describe("SetTableColumnWidthsSchema", () => {
  it("accepts a table id with its widths, or null to reset", () => {
    expect(SetTableColumnWidthsSchema.safeParse({ tableId: "tareas-analitico", widths: { tarea: 420, estatus: 140 } }).success).toBe(true);
    expect(SetTableColumnWidthsSchema.safeParse({ tableId: "tareas-analitico", widths: null }).success).toBe(true);
    expect(SetTableColumnWidthsSchema.safeParse({ tableId: "mi-espacio.tareas", widths: {} }).success).toBe(true);
  });

  it("rejects an id or a key that is not a short identifier", () => {
    expect(SetTableColumnWidthsSchema.safeParse({ tableId: "Tareas", widths: {} }).success).toBe(false);
    expect(SetTableColumnWidthsSchema.safeParse({ tableId: "", widths: {} }).success).toBe(false);
    expect(SetTableColumnWidthsSchema.safeParse({ tableId: "a".repeat(65), widths: {} }).success).toBe(false);
    expect(SetTableColumnWidthsSchema.safeParse({ tableId: "t", widths: { "a b": 100 } }).success).toBe(false);
    expect(SetTableColumnWidthsSchema.safeParse({ tableId: "t", widths: { "": 100 } }).success).toBe(false);
  });

  it("rejects widths that are not sane px values", () => {
    for (const bad of [0, -10, 5, 5000, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(SetTableColumnWidthsSchema.safeParse({ tableId: "t", widths: { a: bad } }).success).toBe(false);
    }
    expect(SetTableColumnWidthsSchema.safeParse({ tableId: "t", widths: { a: "100" } }).success).toBe(false);
  });

  it("rejects more than 40 columns, unknown fields and a missing table id", () => {
    const many = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`c${i}`, 100]));
    expect(SetTableColumnWidthsSchema.safeParse({ tableId: "t", widths: many }).success).toBe(false);
    expect(SetTableColumnWidthsSchema.safeParse({ tableId: "t", widths: {}, extra: 1 }).success).toBe(false);
    expect(SetTableColumnWidthsSchema.safeParse({ widths: {} }).success).toBe(false);
  });
});
