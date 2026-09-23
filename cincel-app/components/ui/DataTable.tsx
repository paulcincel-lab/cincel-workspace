"use client";

import { type ReactNode, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Input } from "@/components/ui/shadcn/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";

/**
 * Shared record table — sticky header, sortable columns, an optional built-in
 * search box, empty/loading states. Replaces the hand-rolled `<table>` markup
 * duplicated across proyectos/tareas/equipo/clientes/proveedores/dashboard
 * (Phase 7). Row actions are just a normal column whose `cell` renders
 * buttons — nothing special needed for that.
 *
 * Deliberately does NOT own each page's existing filter dropdowns (status,
 * área, etc.) — pass already-filtered `data` in for those. `searchPlaceholder`
 * opts into DataTable's own single-text global filter when a page wants one
 * instead of (or in addition to) its own search input.
 */
type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowId?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  emptyMessage?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  initialSorting?: SortingState;
  searchPlaceholder?: string;
  /** Extra classes on the inner <table> — e.g. `min-w-[1100px]` for wide tables. */
  tableClassName?: string;
  /** Extra classes on the outer scroll/border wrapper. */
  wrapperClassName?: string;
  /**
   * Opts into a manual drag-and-drop grip column at the left edge. Called
   * with every visible row's id (via `getRowId`), in its new order, once a
   * drag finishes. Disabled automatically while a column sort or the
   * built-in search filter is active, since dragging a filtered/sorted view
   * can't produce a single well-defined order to persist.
   */
  onReorderRows?: (orderedIds: string[]) => void;
};

function SortIcon({ direction }: { direction: "asc" | "desc" | false }) {
  return (
    <span className="inline-flex flex-col leading-none text-[10px]" aria-hidden>
      <span className={direction === "asc" ? "text-foreground" : "text-muted-foreground/40"}>▲</span>
      <span className={direction === "desc" ? "text-foreground" : "text-muted-foreground/40"}>▼</span>
    </span>
  );
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  onRowClick,
  rowClassName,
  emptyMessage = "No hay resultados.",
  isLoading = false,
  loadingMessage = "Cargando…",
  initialSorting = [],
  searchPlaceholder,
  tableClassName = "",
  wrapperClassName = "",
  onReorderRows,
}: DataTableProps<T>): ReactNode {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = useState("");
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const reorderEnabled = Boolean(onReorderRows) && sorting.length === 0 && !globalFilter;

  const table = useReactTable({
    data,
    columns,
    state: { sorting, ...(searchPlaceholder ? { globalFilter } : {}) },
    onSortingChange: setSorting,
    onGlobalFilterChange: searchPlaceholder ? setGlobalFilter : undefined,
    getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: searchPlaceholder ? getFilteredRowModel() : undefined,
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-background shadow-sm ${wrapperClassName}`}>
      {searchPlaceholder ? (
        <div className="border-b border-border p-3">
          <Input
            type="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="max-w-xs"
          />
        </div>
      ) : null}

      <Table className={tableClassName}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {reorderEnabled ? <TableHead className="w-8" aria-hidden /> : null}
              {headerGroup.headers.map((header) => {
                const sortable = header.column.getCanSort();
                return (
                  <TableHead
                    key={header.id}
                    className={sortable ? "cursor-pointer select-none" : ""}
                    onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {header.isPlaceholder ? null : (
                      <span className="inline-flex items-center gap-1.5">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortable ? <SortIcon direction={header.column.getIsSorted()} /> : null}
                      </span>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={columns.length + (reorderEnabled ? 1 : 0)} className="py-8 text-center text-sm text-muted-foreground">
                {loadingMessage}
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + (reorderEnabled ? 1 : 0)} className="py-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onDragOver={
                  reorderEnabled && dragRowId
                    ? (e) => {
                        e.preventDefault();
                        setDragOverRowId(row.id);
                      }
                    : undefined
                }
                onDragLeave={reorderEnabled ? () => setDragOverRowId((cur) => (cur === row.id ? null : cur)) : undefined}
                onDrop={
                  reorderEnabled && dragRowId
                    ? (e) => {
                        e.preventDefault();
                        setDragOverRowId(null);
                        const fromId = dragRowId;
                        setDragRowId(null);
                        if (!onReorderRows || fromId === row.id) return;
                        const ids = rows.map((r) => r.id);
                        const fromIndex = ids.indexOf(fromId);
                        const toIndex = ids.indexOf(row.id);
                        if (fromIndex === -1 || toIndex === -1) return;
                        ids.splice(toIndex, 0, ids.splice(fromIndex, 1)[0]);
                        onReorderRows(ids);
                      }
                    : undefined
                }
                className={`${onRowClick ? "cursor-pointer" : ""} ${dragOverRowId === row.id ? "bg-muted" : ""} ${rowClassName?.(row.original) ?? ""}`}
              >
                {reorderEnabled ? (
                  <TableCell
                    className="w-8 cursor-grab text-muted-foreground active:cursor-grabbing"
                    draggable
                    onClick={(e) => e.stopPropagation()}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      setDragRowId(row.id);
                    }}
                    onDragEnd={() => {
                      setDragRowId(null);
                      setDragOverRowId(null);
                    }}
                    title="Arrastra para reordenar"
                  >
                    ⠿
                  </TableCell>
                ) : null}
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
