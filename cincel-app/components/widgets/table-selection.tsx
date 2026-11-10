"use client";

import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import { Checkbox } from "@/components/ui/shadcn/checkbox";
import {
  SELECT_ALL_LABEL,
  SELECT_ROW_LABEL,
  selectionState,
  setRowsSelected,
  toggleRowSelection,
  type TableSelectionProps,
} from "@/components/widgets/table-rows";

/**
 * The leading checkbox column of `GroupedTable` and `DataTable` (#1040):
 * row and header checkboxes over the controlled `selectedIds`, shift-click
 * ranges in table order, and the table's keys (Space on a focused grid cell
 * toggles its row, Esc clears the selection). The checkbox column is its own
 * column, outside the editable-cell grid.
 */

const NONE: ReadonlySet<string> = new Set<string>();

export type TableSelection = {
  enabled: boolean;
  selected: ReadonlySet<string>;
  isSelected(id: string): boolean;
  /** A row checkbox; `range` (shift) selects from the last clicked row. */
  toggle(id: string, range: boolean): void;
  /** A header checkbox: every id given on, or off when they were all on. */
  toggleAll(ids: readonly string[]): void;
  /** Spread-free key handler for the table's wrapper (call it from its `onKeyDown`). */
  onKeyDown(event: KeyboardEvent<HTMLElement>): void;
};

function isTyping(el: HTMLElement): boolean {
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

/** `order`: every selectable row id, in the order the table shows them. */
export function useTableSelection<Row>(props: TableSelectionProps<Row>, order: readonly string[]): TableSelection {
  const anchor = useRef<string | null>(null);
  const enabled = props.selectable === true;
  const selected = props.selectedIds ?? NONE;
  const emit = (next: ReadonlySet<string>) => props.onSelectionChange?.(next);

  const toggle = (id: string, range: boolean) => {
    emit(toggleRowSelection(selected, id, { order, anchor: anchor.current, range }));
    anchor.current = id;
  };

  return {
    enabled,
    selected,
    isSelected: (id) => selected.has(id),
    toggle,
    toggleAll(ids) {
      emit(setRowsSelected(selected, ids, selectionState(selected, ids) !== "all"));
      anchor.current = null;
    },
    onKeyDown(event) {
      if (!enabled || event.defaultPrevented) return;
      const target = event.target;
      // Keys typed in a cell editor or menu (portals) bubble here through React: only the table's own count.
      if (!(target instanceof HTMLElement) || !event.currentTarget.contains(target)) return;
      if (event.key === "Escape") {
        if (selected.size === 0 || isTyping(target)) return;
        event.preventDefault();
        anchor.current = null;
        emit(new Set());
        return;
      }
      if (event.key !== " " || event.metaKey || event.ctrlKey || event.altKey) return;
      // Space on a focused grid cell toggles its row (on the checkbox itself the checkbox handles it).
      const row = target.hasAttribute("data-grid-cell") ? target.dataset.cellRow : undefined;
      if (!row) return;
      event.preventDefault();
      toggle(row, event.shiftKey);
    },
  };
}

/** Classes of the leading `th` / `td` (narrow, before the first column's own padding). */
export const SELECT_CELL_CLASS = "w-8 pr-0 pl-3";

type CheckboxBaseProps = { checked: boolean; indeterminate?: boolean; label: string; onToggle(range: boolean): void };

function SelectCheckbox({ checked, indeterminate, label, onToggle }: CheckboxBaseProps) {
  // Shift is read from the pointer / key that starts the change (the change event carries no modifiers).
  const shift = useRef(false);
  return (
    <span
      className="inline-flex align-middle"
      // The checkbox never opens a row or a cell editor.
      onClick={(event: MouseEvent) => event.stopPropagation()}
    >
      <Checkbox
        checked={checked}
        indeterminate={indeterminate}
        aria-label={label}
        data-slot="row-select"
        onPointerDown={(event: PointerEvent) => {
          shift.current = event.shiftKey;
        }}
        onKeyDown={(event: KeyboardEvent) => {
          shift.current = event.shiftKey;
        }}
        onCheckedChange={() => {
          const range = shift.current;
          shift.current = false;
          onToggle(range);
        }}
      />
    </span>
  );
}

/** The checkbox of one row: "Seleccionar «…»". */
export function RowSelectCheckbox({
  selection,
  id,
  label,
}: {
  selection: TableSelection;
  id: string;
  label: string;
}) {
  return (
    <SelectCheckbox
      checked={selection.isSelected(id)}
      label={SELECT_ROW_LABEL(label)}
      onToggle={(range) => selection.toggle(id, range)}
    />
  );
}

/** The header checkbox over `ids` (a group's rows, or the whole table): mixed while only some are on. */
export function HeaderSelectCheckbox({ selection, ids }: { selection: TableSelection; ids: readonly string[] }) {
  const state = selectionState(selection.selected, ids);
  if (ids.length === 0) return null;
  return (
    <SelectCheckbox
      checked={state === "all"}
      indeterminate={state === "some"}
      label={SELECT_ALL_LABEL}
      onToggle={() => selection.toggleAll(ids)}
    />
  );
}
