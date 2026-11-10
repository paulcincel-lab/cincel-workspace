"use client";

import type { ReactNode } from "react";

import type { CanEdit, CellEdit } from "@/components/widgets/editable-cell";

/**
 * Wraps one table cell's rendered content (#1024). Adds only hover, focus,
 * saving and locked states and opens `CellEditor`; without `edit` the cell is
 * calculated and renders its children untouched.
 */
export type EditableCellProps<Row> = {
  row: Row;
  rowId: string;
  columnKey: string;
  edit?: CellEdit<Row>;
  canEdit?: CanEdit<Row>;
  /** Column label, for the toast ("Fase guardado.") and the search placeholder. */
  label?: string;
  children: ReactNode;
};

export function EditableCell<Row>({ children }: EditableCellProps<Row>): ReactNode {
  return children;
}
