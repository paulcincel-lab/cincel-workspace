/**
 * Pure helpers of `RecordTable` (redesign FE §4.10.1, §15.2): cell formatting
 * by `column.format`, numeric alignment, heat levels and the "auto" totals
 * row. Kept apart from the component so other widgets and tests share them.
 */
import type { PresentationStyle } from "@/lib/types/redesign";
import type { RecordColumn, RecordColumnFormat, RecordTableData } from "@/lib/types/widgets";

const LOCALE = "es-MX";

const NUMBER = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const MXN = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const DATE = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" });

/** Shown for a missing value. */
export const EMPTY_CELL = "—";

/** Formats whose values are numbers (right-aligned, mono in Analítico, totaled by "auto"). */
const NUMERIC_FORMATS: readonly RecordColumnFormat[] = ["count", "percent", "hours", "days", "delta", "mxn"];

/** Formats whose "auto" total is the average of the rows instead of the sum. */
const AVERAGED_FORMATS: readonly RecordColumnFormat[] = ["percent", "days"];

export function isNumericColumn(column: RecordColumn): boolean {
  return column.format !== undefined && NUMERIC_FORMATS.includes(column.format);
}

/** `column.align`, or right for numeric formats. */
export function columnAlign(column: RecordColumn): "left" | "right" {
  return column.align ?? (isNumericColumn(column) ? "right" : "left");
}

/** `column.mono`, or numeric formats in Analítico (FE §15.2: numbers in Geist Mono). */
export function columnMono(column: RecordColumn, style: PresentationStyle): boolean {
  return column.mono ?? (style === "analitico" && isNumericColumn(column));
}

/** The columns a style renders: those whose `hideOn` does not list it. */
export function visibleColumns(columns: RecordColumn[], style: PresentationStyle): RecordColumn[] {
  return columns.filter((column) => !column.hideOn?.includes(style));
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A `YYYY-MM-DD` date is read as a local calendar day; anything else goes through `Date`. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Text of one value for a column format (`"es-MX"`, lowercase dates, signed deltas). */
export function formatValue(value: unknown, format: RecordColumnFormat | undefined): string {
  if (value === null || value === undefined || value === "") return EMPTY_CELL;
  if (format === "date") {
    const date = toDate(value);
    return date ? DATE.format(date).toLowerCase() : String(value);
  }
  if (format === undefined || format === "text") return String(value);
  const n = toNumber(value);
  if (n === null) return String(value);
  switch (format) {
    case "count":
      return NUMBER.format(n);
    case "percent":
      return `${NUMBER.format(n)}%`;
    case "hours":
      return `${NUMBER.format(n)} h`;
    case "days":
      return `${NUMBER.format(n)} d`;
    case "mxn":
      return MXN.format(n);
    case "delta":
      if (n > 0) return `+${NUMBER.format(n)}`;
      if (n < 0) return `−${NUMBER.format(Math.abs(n))}`;
      return NUMBER.format(0);
  }
}

/** Formatted cell of a row for a column. */
export function formatCell(column: RecordColumn, row: Record<string, unknown>): string {
  return formatValue(row[column.key], column.format);
}

/** True for a negative delta (rendered as `destructive` text, the sign carries the meaning). */
export function isNegativeDelta(column: RecordColumn, row: Record<string, unknown>): boolean {
  if (column.format !== "delta") return false;
  const n = toNumber(row[column.key]);
  return n !== null && n < 0;
}

export type HeatLevel = "crit" | "warn" | null;

/** Heat of a cell (FE §15.2): above `critAt` → crit, above `warnAt` → warn; strict comparisons. */
export function heatLevel(heat: RecordTableData["heat"], key: string, value: unknown): HeatLevel {
  const rule = heat?.find((h) => h.key === key);
  if (!rule) return null;
  const n = toNumber(value);
  if (n === null) return null;
  if (n > rule.critAt) return "crit";
  if (n > rule.warnAt) return "warn";
  return null;
}

/** Label of the first column of the totals row when the data gives none. */
export const TOTALS_LABEL = "Total";

/**
 * The totals row values by column key, or null when the data has no totals.
 * `"auto"`: sum of numeric columns (average for `percent` and `days`, one
 * decimal); non-numeric columns stay empty. The first column carries "Total"
 * unless the data sets it.
 */
export function computeTotals(data: RecordTableData, columns: RecordColumn[]): Record<string, string | number> | null {
  if (!data.totals) return null;
  const first = columns[0]?.key;
  if (data.totals !== "auto") {
    return first && data.totals[first] === undefined ? { ...data.totals, [first]: TOTALS_LABEL } : data.totals;
  }
  const totals: Record<string, string | number> = {};
  for (const column of columns) {
    if (!isNumericColumn(column)) continue;
    const values = data.rows.map((row) => toNumber(row[column.key])).filter((n): n is number => n !== null);
    if (values.length === 0) continue;
    const sum = values.reduce((acc, n) => acc + n, 0);
    const value = column.format && AVERAGED_FORMATS.includes(column.format) ? sum / values.length : sum;
    totals[column.key] = Math.round(value * 10) / 10;
  }
  if (first && totals[first] === undefined) totals[first] = TOTALS_LABEL;
  return totals;
}

/** Formatted totals cell for a column (strings as given, numbers by the column format). */
export function formatTotal(column: RecordColumn, totals: Record<string, string | number>): string {
  const value = totals[column.key];
  if (value === undefined) return "";
  return typeof value === "number" ? formatValue(value, column.format) : value;
}

/** Stable id of a row: its `id` field when it is a string or number, else its index. */
export function rowId(row: Record<string, unknown>, index: number): string {
  return typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : `#${index}`;
}

/** Label of a group: the `groupBy` value formatted by its column when the column exists. */
export function groupLabel(data: RecordTableData, row: Record<string, unknown>): string {
  if (!data.groupBy) return "";
  const column = data.columns.find((c) => c.key === data.groupBy);
  return formatValue(row[data.groupBy], column?.format);
}
