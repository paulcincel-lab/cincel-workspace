"use client";

import { Fragment, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { ROW_ACTIONS_LABEL, type TableRowAction } from "@/components/widgets/table-rows";

/**
 * The `⋯` menu at the end of a table row (#1041): shown on row hover or
 * focus, always on touch. Destructive entries come last, in the destructive
 * tone. Built on the shadcn DropdownMenu like `components/v2/table/RowActionsMenu`.
 */
export type RowActionsMenuProps = {
  /** The row's name, for the trigger's label ("Acciones de «…»"). */
  rowLabel: string;
  actions: TableRowAction[];
};

/** Screen-reader header of the actions column. */
export const ROW_ACTIONS_HEADER = "Acciones";
/** Width of the actions column, px. */
export const ROW_ACTIONS_WIDTH = 40;

/**
 * Trigger visibility: hidden at rest so the row looks as before, shown while
 * the row (`group/row`) is hovered or holds focus, while the menu is open, and
 * always on coarse pointers (touch).
 */
const TRIGGER_CLASS =
  "inline-flex size-7 items-center justify-center rounded-md text-sm font-bold tracking-widest text-muted-foreground outline-none " +
  "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring " +
  "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100";

export function RowActionsMenu({ rowLabel, actions }: RowActionsMenuProps): ReactNode {
  if (actions.length === 0) return null;
  const plain = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  const ordered = [...plain, ...destructive];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="row-actions"
        className={TRIGGER_CLASS}
        aria-label={ROW_ACTIONS_LABEL(rowLabel)}
        title={ROW_ACTIONS_LABEL(rowLabel)}
        // A click on the trigger never also opens the row (`onRowClick`).
        onClick={(event: MouseEvent) => event.stopPropagation()}
      >
        <span aria-hidden="true">⋯</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ordered.map((action, index) => (
          <Fragment key={action.id}>
            {action.destructive && index > 0 && index === plain.length ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={action.destructive ? "destructive" : "default"}
              onClick={(event: MouseEvent) => {
                // The menu is portaled, but React events still bubble to the row's click.
                event.stopPropagation();
                action.onSelect();
              }}
            >
              {action.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Keys typed here belong to a field or an open menu, not to the row. */
const OWN_KEYS_SELECTOR = "input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']";

/**
 * Supr on a focused row (#1041): `onDelete` (the delete confirmation). Not
 * from a field, an open menu or a cell editor (those are portaled, so their
 * keys reach the row only through React and fail the DOM `contains` check).
 * Handled before the grid so Supr on a cell deletes the row instead of
 * clearing the cell; Backspace still clears it.
 */
export function rowDeleteKeyDown(event: ReactKeyboardEvent<HTMLElement>, onDelete: (() => void) | undefined): void {
  if (!onDelete || event.key !== "Delete" || event.defaultPrevented) return;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  const target = event.target;
  if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
  if (target.closest(OWN_KEYS_SELECTOR)) return;
  event.preventDefault();
  event.stopPropagation();
  onDelete();
}
