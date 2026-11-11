/**
 * Row checkboxes and row actions of the record tables (#1040, #1041): the
 * props `GroupedTable` and `DataTable` share for a leading checkbox column
 * and a trailing `⋯` actions column, and their copy. Pure and client-safe.
 *
 * Selection is controlled: the page owns the selected ids (see
 * `useTaskSelection`) and the table only renders the checkboxes and reports
 * changes. Both columns are their own grid columns, outside the editable
 * cells.
 */

/** One entry of a row's `⋯` menu. */
export type TableRowAction = {
  id: string;
  label: string;
  /** Shown in the destructive tone, after a separator. */
  destructive?: boolean;
  onSelect(): void;
};

/** A leading checkbox column (#1040). Without `selectable` nothing changes. */
export type TableSelectionProps<Row> = {
  selectable?: boolean;
  /** The selected row ids (`getRowId`), controlled. */
  selectedIds?: ReadonlySet<string>;
  /** Every change: a click, shift-click range, header checkbox, Space or Esc. */
  onSelectionChange?(ids: ReadonlySet<string>): void;
  /** The row's name for its checkbox and actions menu labels ("Seleccionar «…»"). */
  getRowLabel?(row: Row): string;
};

/** A trailing `⋯` actions column (#1041). Without `rowActions` nothing changes. */
export type TableRowActionsProps<Row> = {
  /** The row's menu entries; an empty list hides the menu on that row. */
  rowActions?(row: Row): TableRowAction[];
  /** Supr on a focused row (outside a cell editor). */
  onRowDelete?(row: Row): void;
};

// Copy (Spanish, sentence case).
export const SELECT_ROW_LABEL = (label: string): string => `Seleccionar «${label}»`;
export const SELECT_ALL_LABEL = "Seleccionar todas";
export const ROW_ACTIONS_LABEL = (label: string): string => `Acciones de «${label}»`;
export const SELECTED_COUNT = (n: number): string => (n === 1 ? "1 seleccionada" : `${n} seleccionadas`);
export const CLEAR_SELECTION_LABEL = "Quitar selección";
export const DELETE_LABEL = "Eliminar";
export const OPEN_LABEL = "Abrir";
export const DUPLICATE_LABEL = "Duplicar";
export const CANCEL_LABEL = "Cancelar";

// ── Selection (#1040): pure helpers both tables and `useTaskSelection` share.

/** How many of `ids` are selected: every one, some or none (the header checkbox). */
export type SelectionState = "all" | "some" | "none";

export function selectionState(selected: ReadonlySet<string>, ids: readonly string[]): SelectionState {
  if (ids.length === 0) return "none";
  let count = 0;
  for (const id of ids) if (selected.has(id)) count += 1;
  return count === 0 ? "none" : count === ids.length ? "all" : "some";
}

/** `ids` selected (or unselected), the rest kept. */
export function setRowsSelected(selected: ReadonlySet<string>, ids: readonly string[], on: boolean): Set<string> {
  const next = new Set(selected);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

/**
 * The selection after a click on `id`'s checkbox. With `range` (shift-click)
 * and an `anchor` (the last row clicked) in `order`, every row from the anchor
 * to `id` takes the clicked row's new state; otherwise only `id` toggles.
 */
export function toggleRowSelection(
  selected: ReadonlySet<string>,
  id: string,
  options: { order: readonly string[]; anchor?: string | null; range?: boolean },
): Set<string> {
  const on = !selected.has(id);
  const { order, anchor, range } = options;
  if (range && anchor && anchor !== id) {
    const from = order.indexOf(anchor);
    const to = order.indexOf(id);
    if (from !== -1 && to !== -1) {
      return setRowsSelected(selected, order.slice(Math.min(from, to), Math.max(from, to) + 1), on);
    }
  }
  return setRowsSelected(selected, [id], on);
}

/** "Cargar más" under a paged table (#1051). */
export const LOAD_MORE_TEXT = "Cargar más";

/** "Cargar más (12 restantes)"; just "Cargar más" without a count. */
export function loadMoreText(remaining: number | undefined): string {
  if (!remaining || remaining <= 0) return LOAD_MORE_TEXT;
  return `${LOAD_MORE_TEXT} (${remaining} ${remaining === 1 ? "restante" : "restantes"})`;
}
