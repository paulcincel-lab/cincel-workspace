"use client";

import type { ReactNode } from "react";

import type { CellEdit } from "@/components/widgets/editable-cell";

/**
 * The popover editor of one cell (#1023), anchored to the cell, built on the
 * shadcn Popover + Command primitives. One component for the four kinds
 * (select, person, date, text); a locked cell shows only its reason.
 */
export type CellEditorProps<Row> = {
  /** The cell element the popover is anchored to; focus returns to it on close. */
  anchor: HTMLElement | null;
  edit: CellEdit<Row>;
  row: Row;
  /** `canEdit(row)` result: true, or the lock reason shown instead of the editor. */
  canEdit: true | string;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Called with the chosen value after a save (Enter, a pick, Tab). */
  onCommitted?(value: string | null): void;
  /** Tab inside the editor: saved; the table moves to the next editable cell in the row. */
  onTabNext?(): void;
  /** Letter typed on the cell that opened a list editor; seeds its search. */
  initialQuery?: string;
  /** Field name for the search placeholder and the toast ("Responsable"). */
  label?: string;
};

export function CellEditor<Row>(props: CellEditorProps<Row>): ReactNode {
  void props;
  return null;
}
