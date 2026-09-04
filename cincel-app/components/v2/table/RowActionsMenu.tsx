"use client";

import { Fragment, type MouseEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";

export interface RowAction<T> {
  label: string;
  onSelect: (row: T) => void;
  variant?: "default" | "destructive";
  /** Renders a separator above this item. */
  separatorBefore?: boolean;
}

interface RowActionsMenuProps<T> {
  row: T;
  actions: RowAction<T>[];
}

/**
 * The single `⋯` row-actions menu every v2 table uses instead of a row of
 * inline buttons (Ficha/Actividades/Nota, Ver ficha, etc.) — see the "Cincel
 * Screen Proposals" artifact for the design rationale. This column is always
 * the first to collapse via `actioncol`'s narrow fixed width; the row stays
 * reachable via `onRowClick` on DataTable.
 */
export function RowActionsMenu<T>({ row, actions }: RowActionsMenuProps<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-7 items-center justify-center rounded-md text-sm font-bold tracking-widest text-muted-foreground hover:bg-muted"
        onClick={(e: MouseEvent) => e.stopPropagation()}
        aria-label="Acciones"
      >
        <span aria-hidden>⋯</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action, i) => (
          <Fragment key={action.label}>
            {action.separatorBefore && i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={action.variant === "destructive" ? "destructive" : "default"}
              onClick={() => action.onSelect(row)}
            >
              {action.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Column-def factory for a `⋯` actions column, used the same way as
 * `buildPresaleColumns` in components/tareas/PresaleRow.tsx builds other
 * column groups — pass it straight into a `ColumnDef<T, unknown>[]` array.
 */
export function createRowActionsColumn<T>(
  getActions: (row: T) => RowAction<T>[]
): ColumnDef<T, unknown> {
  return {
    id: "actions",
    header: "",
    size: 36,
    cell: ({ row }) => <RowActionsMenu row={row.original} actions={getActions(row.original)} />,
  };
}
