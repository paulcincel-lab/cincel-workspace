import type { ColumnDef } from "@tanstack/react-table";
import type { MouseEvent } from "react";

import { Checkbox } from "@/components/ui/shadcn/checkbox";

interface SelectionColumnOptions<T> {
  getId: (row: T) => string | number;
  selectedIds: ReadonlySet<string | number>;
  onToggle: (id: string | number) => void;
  onToggleAll: (ids: (string | number)[]) => void;
}

/**
 * Column-def factory for a bulk-select checkbox column, for task lists that
 * need "select several, act on all of them" (see BulkActionBar). Selection
 * state is owned by the calling page/hook (e.g. `useState<Set<id>>`), same
 * pattern as other page-owned state like lib/proyectos/use-projects-data.ts —
 * this factory only wires that state to the table's header/row checkboxes.
 */
export function createSelectionColumn<T>({
  getId,
  selectedIds,
  onToggle,
  onToggleAll,
}: SelectionColumnOptions<T>): ColumnDef<T, unknown> {
  return {
    id: "select",
    size: 34,
    header: ({ table }) => {
      const ids = table.getRowModel().rows.map((r) => getId(r.original));
      const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
      return (
        <div onClick={(e: MouseEvent) => e.stopPropagation()} className="flex">
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => onToggleAll(ids)}
            aria-label="Seleccionar todo"
          />
        </div>
      );
    },
    cell: ({ row }) => {
      const id = getId(row.original);
      return (
        <div onClick={(e: MouseEvent) => e.stopPropagation()} className="flex">
          <Checkbox
            checked={selectedIds.has(id)}
            onCheckedChange={() => onToggle(id)}
            aria-label="Seleccionar fila"
          />
        </div>
      );
    },
  };
}
