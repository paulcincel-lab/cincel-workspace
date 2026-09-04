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
}: DataTableProps<T>): ReactNode {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = useState("");

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
              <TableCell colSpan={columns.length} className="py-8 text-center text-sm text-muted-foreground">
                {loadingMessage}
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={`${onRowClick ? "cursor-pointer" : ""} ${rowClassName?.(row.original) ?? ""}`}
              >
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
