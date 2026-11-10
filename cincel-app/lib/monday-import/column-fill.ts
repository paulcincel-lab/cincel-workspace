/**
 * "Con dato" of Equivalencias › Columnas (Ajustes › Importar de monday): per
 * column, the share (0..1) of the board's items that carry a value in it.
 * Computed with the export source (`getExportSource`), next to the status
 * label counts. Pure: no I/O.
 */

type ColumnValueLike = { id?: string | null; text?: string | null; label?: string | null } | null | undefined;
type ItemLike = { column_values?: readonly ColumnValueLike[] | null } | null | undefined;

/** True when a column value has something in it: a non-blank text (or a status label). */
function hasValue(value: ColumnValueLike): boolean {
  if (!value) return false;
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (text) return true;
  return typeof value.label === "string" && value.label.trim() !== "";
}

/**
 * columnId → items with a value ÷ `itemCount`, for every column in
 * `columnIds` (0 when none has one, or the board has no items). Rounded to 4
 * decimals.
 */
export function columnFill(
  columnIds: readonly string[],
  items: readonly ItemLike[],
  itemCount: number = items.length,
): Record<string, number> {
  const filled = new Map<string, number>(columnIds.map((id) => [id, 0]));
  for (const item of items) {
    const seen = new Set<string>();
    for (const value of item?.column_values ?? []) {
      const id = value?.id;
      if (!id || seen.has(id) || !filled.has(id) || !hasValue(value)) continue;
      seen.add(id);
      filled.set(id, (filled.get(id) ?? 0) + 1);
    }
  }
  const out: Record<string, number> = {};
  for (const [id, n] of filled) out[id] = itemCount > 0 ? Math.round((n / itemCount) * 10_000) / 10_000 : 0;
  return out;
}
