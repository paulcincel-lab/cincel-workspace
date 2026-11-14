import { describe, expect, it } from "vitest";

import type { RecordColumn } from "@/lib/types/widgets";
import {
  DEFAULT_COLUMN_WIDTH,
  FILL_MIN_WIDTH,
  KEYBOARD_STEP,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  clampWidth,
  columnBounds,
  columnWidthVar,
  defaultWidth,
  effectiveWidth,
  fitWidth,
  hasRememberedWidths,
  sanitizeTableWidths,
  stepWidth,
  tableWidths,
  widthVars,
  withColumnWidth,
  withoutTableWidths,
} from "@/lib/ui/table-widths";

const title: RecordColumn = { key: "tarea", label: "Tarea", fill: true };
const status: RecordColumn = { key: "estatus", label: "Estatus", width: 140, minWidth: 100, maxWidth: 300 };
const plain: RecordColumn = { key: "vence", label: "Vence" };

describe("column bounds and clamp", () => {
  it("uses the defaults, a larger minimum for a title column, and the column's own bounds", () => {
    expect(columnBounds(plain)).toEqual({ min: MIN_COLUMN_WIDTH, max: MAX_COLUMN_WIDTH });
    expect(columnBounds(title)).toEqual({ min: FILL_MIN_WIDTH, max: MAX_COLUMN_WIDTH });
    expect(columnBounds(status)).toEqual({ min: 100, max: 300 });
  });

  it("never lets the maximum fall under the minimum", () => {
    expect(columnBounds({ minWidth: 400, maxWidth: 200 })).toEqual({ min: 400, max: 400 });
  });

  it("clamps, rounds and turns a non-finite value into the minimum", () => {
    const bounds = columnBounds(status);
    expect(clampWidth(50, bounds)).toBe(100);
    expect(clampWidth(999, bounds)).toBe(300);
    expect(clampWidth(150.6, bounds)).toBe(151);
    expect(clampWidth(Number.NaN, bounds)).toBe(100);
  });
});

describe("fit and keyboard step", () => {
  it("fits to the natural width rounded up, inside the bounds", () => {
    const bounds = columnBounds(status);
    expect(fitWidth(212.2, bounds)).toBe(213);
    expect(fitWidth(20, bounds)).toBe(100);
    expect(fitWidth(5000, bounds)).toBe(300);
  });

  it("moves 16 px with the arrows, stays in the bounds and ignores other keys", () => {
    const bounds = columnBounds(status);
    expect(KEYBOARD_STEP).toBe(16);
    expect(stepWidth(140, "ArrowRight", bounds)).toBe(156);
    expect(stepWidth(140, "ArrowLeft", bounds)).toBe(124);
    expect(stepWidth(105, "ArrowLeft", bounds)).toBe(100);
    expect(stepWidth(295, "ArrowRight", bounds)).toBe(300);
    expect(stepWidth(140, "Enter", bounds)).toBeNull();
  });
});

describe("widths in force", () => {
  it("defaults: the column width, 123 px without one, auto for a title column", () => {
    expect(defaultWidth(status)).toBe(140);
    expect(defaultWidth(plain)).toBe(DEFAULT_COLUMN_WIDTH);
    expect(defaultWidth(title)).toBeNull();
  });

  it("a remembered width wins and is clamped to the column's bounds", () => {
    expect(effectiveWidth(status, { estatus: 220 })).toBe(220);
    expect(effectiveWidth(status, { estatus: 900 })).toBe(300);
    expect(effectiveWidth(title, { tarea: 500 })).toBe(500);
    expect(effectiveWidth(title, {})).toBeNull();
    expect(effectiveWidth(status, undefined)).toBe(140);
  });

  it("one CSS variable per column, `auto` for a title column without a width", () => {
    expect(columnWidthVar("diasRetraso")).toBe("--cw-diasRetraso");
    expect(columnWidthVar("a b.c")).toBe("--cw-a_b_c");
    expect(widthVars([title, status], { estatus: 200 })).toEqual({ "--cw-tarea": "auto", "--cw-estatus": "200px" });
  });

  it("the table is 100% wide while a title column takes the rest, and the exact sum once every column has a width", () => {
    expect(tableWidths([title, status], undefined, 40)).toEqual({ width: "100%", min: FILL_MIN_WIDTH + 140 + 40 });
    expect(tableWidths([title, status], { tarea: 400 }, 40)).toEqual({ width: "580px", min: 580 });
    // Never narrower than its card by default: no title column and nothing remembered.
    expect(tableWidths([status, plain], undefined)).toEqual({ width: "100%", min: 140 + DEFAULT_COLUMN_WIDTH });
    expect(tableWidths([status, plain], { estatus: 200 })).toEqual({ width: `${200 + DEFAULT_COLUMN_WIDTH}px`, min: 200 + DEFAULT_COLUMN_WIDTH });
  });

  it("knows whether anything is remembered", () => {
    expect(hasRememberedWidths([title, status], { estatus: 200 })).toBe(true);
    expect(hasRememberedWidths([title, status], { otro: 200 })).toBe(false);
    expect(hasRememberedWidths([title], undefined)).toBe(false);
  });
});

describe("persistence model", () => {
  it("sets one column without touching the others", () => {
    const all = { tareas: { tarea: 400 }, otra: { x: 90 } };
    const next = withColumnWidth(all, "tareas", "estatus", 180.4);
    expect(next).toEqual({ tareas: { tarea: 400, estatus: 180 }, otra: { x: 90 } });
    expect(all).toEqual({ tareas: { tarea: 400 }, otra: { x: 90 } });
    expect(withColumnWidth(undefined, "t", "k", 100)).toEqual({ t: { k: 100 } });
  });

  it("reset removes only that table", () => {
    const all = { tareas: { tarea: 400 }, otra: { x: 90 } };
    expect(withoutTableWidths(all, "tareas")).toEqual({ otra: { x: 90 } });
    expect(withoutTableWidths(undefined, "tareas")).toEqual({});
  });

  it("keeps only positive finite numbers of a stored entry", () => {
    expect(sanitizeTableWidths({ a: 120.4, b: "x", c: -5, d: Number.POSITIVE_INFINITY, e: null })).toEqual({ a: 120 });
    expect(sanitizeTableWidths(null)).toEqual({});
    expect(sanitizeTableWidths("x")).toEqual({});
  });
});
