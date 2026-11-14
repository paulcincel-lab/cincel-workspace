import type { TableColumnWidths } from "@/lib/types/redesign";
import type { RecordColumn } from "@/lib/types/widgets";

/**
 * The width model of resizable tables (#1125): bounds, clamp, fit-to-content,
 * the keyboard step, and the immutable updates of the remembered
 * `{ [tableId]: { [columnKey]: px } }` map. Pure: the DOM side (CSS variables,
 * pointer and keyboard) is `components/widgets/table-column-resize.tsx`.
 */

/** Narrowest and widest a column can be dragged unless the column says otherwise, in px. */
export const MIN_COLUMN_WIDTH = 64;
export const MAX_COLUMN_WIDTH = 720;
/** A title column (`fill`) is never narrower than this by default. */
export const FILL_MIN_WIDTH = 280;
/** Width of a column without `width` (7 columns ≈ 860 px, frame `Main`). */
export const DEFAULT_COLUMN_WIDTH = 123;
/** The checkbox column (`w-8`), in px. */
export const SELECT_COLUMN_WIDTH = 32;
/** Left and Right on a focused handle change the width by this many px. */
export const KEYBOARD_STEP = 16;
/** The save is sent this long after the last change. */
export const WIDTHS_SAVE_DEBOUNCE_MS = 600;

export type WidthBounds = { min: number; max: number };

/** The bounds of a column: its `minWidth`/`maxWidth`, else the defaults (a `fill` column starts at `FILL_MIN_WIDTH`). */
export function columnBounds(column: Pick<RecordColumn, "minWidth" | "maxWidth" | "fill">): WidthBounds {
  const min = Math.max(1, Math.round(column.minWidth ?? (column.fill ? FILL_MIN_WIDTH : MIN_COLUMN_WIDTH)));
  const max = Math.max(min, Math.round(column.maxWidth ?? MAX_COLUMN_WIDTH));
  return { min, max };
}

/** `px` rounded and held inside the bounds; a non-finite value becomes the minimum. */
export function clampWidth(px: number, bounds: WidthBounds): number {
  if (!Number.isFinite(px)) return bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(px)));
}

/** The width that shows a measured natural cell width (padding included) in full, rounded up, within the bounds. */
export function fitWidth(naturalPx: number, bounds: WidthBounds): number {
  return clampWidth(Math.ceil(naturalPx), bounds);
}

/** One keyboard step: ArrowRight widens, ArrowLeft narrows, within the bounds. Null for any other key. */
export function stepWidth(current: number, key: string, bounds: WidthBounds): number | null {
  if (key === "ArrowRight") return clampWidth(current + KEYBOARD_STEP, bounds);
  if (key === "ArrowLeft") return clampWidth(current - KEYBOARD_STEP, bounds);
  return null;
}

/** The width a column has without a remembered one: null for a `fill` column (`auto`). */
export function defaultWidth(column: Pick<RecordColumn, "width" | "fill">): number | null {
  if (column.fill) return null;
  return column.width ?? DEFAULT_COLUMN_WIDTH;
}

/** The width in force: the remembered one (clamped to the bounds), else the default (null = `auto`). */
export function effectiveWidth(column: RecordColumn, remembered: Record<string, number> | undefined): number | null {
  const stored = remembered?.[column.key];
  if (typeof stored === "number" && Number.isFinite(stored)) return clampWidth(stored, columnBounds(column));
  return defaultWidth(column);
}

/** True when the table has a remembered width for any of these columns. */
export function hasRememberedWidths(columns: readonly RecordColumn[], remembered: Record<string, number> | undefined): boolean {
  return columns.some((column) => typeof remembered?.[column.key] === "number");
}

/**
 * The table's own width. It is `100%` wide, `min` being the floor (its
 * horizontal scroll), while the user has not resized it or a `fill` column
 * still takes the free space. Once the user set a width and every column has
 * one, the table is exactly their sum, so a dragged column follows the pointer.
 */
export function tableWidths(
  columns: readonly RecordColumn[],
  remembered: Record<string, number> | undefined,
  extra = 0,
): { width: string; min: number } {
  let sum = extra;
  let open = false;
  const custom = hasRememberedWidths(columns, remembered);
  for (const column of columns) {
    const width = effectiveWidth(column, remembered);
    if (width === null) {
      open = true;
      sum += columnBounds(column).min;
    } else {
      sum += width;
    }
  }
  return { width: open || !custom ? "100%" : `${sum}px`, min: sum };
}

/** The CSS custom property that holds a column's width on the table's root element. */
export function columnWidthVar(key: string): string {
  return `--cw-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** `{ [var]: "320px" | "auto" }` for every column, to spread on the root's `style`. */
export function widthVars(columns: readonly RecordColumn[], remembered: Record<string, number> | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const column of columns) {
    const width = effectiveWidth(column, remembered);
    vars[columnWidthVar(column.key)] = width === null ? "auto" : `${width}px`;
  }
  return vars;
}

/** Keeps the finite numbers of a stored table entry; anything else is dropped. */
export function sanitizeTableWidths(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) out[key] = Math.round(value);
  }
  return out;
}

/** The map with one column's width set (the other tables and columns untouched). */
export function withColumnWidth(all: TableColumnWidths | undefined, tableId: string, key: string, px: number): TableColumnWidths {
  return { ...all, [tableId]: { ...all?.[tableId], [key]: Math.round(px) } };
}

/** The map without a table's remembered widths ("Restablecer anchos"). */
export function withoutTableWidths(all: TableColumnWidths | undefined, tableId: string): TableColumnWidths {
  const { [tableId]: removed, ...rest } = all ?? {};
  void removed;
  return rest;
}
