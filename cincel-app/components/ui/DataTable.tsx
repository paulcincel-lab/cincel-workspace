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
      <span className={direction === "asc" ? "text-slate-700" : "text-slate-300"}>▲</span>
      <span className={direction === "desc" ? "text-slate-700" : "text-slate-300"}>▼</span>
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
    <div
      className={`overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm ${wrapperClassName}`}
    >
      {searchPlaceholder ? (
        <div className="border-b border-slate-100 p-3">
          <input
            type="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
          />
        </div>
      ) : null}

      <table className={`w-full ${tableClassName}`}>
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-700">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sortable = header.column.getCanSort();
                return (
                  <th
                    key={header.id}
                    className={`px-4 py-3 ${sortable ? "cursor-pointer select-none" : ""}`}
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
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-slate-500">
                {loadingMessage}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={`border-b border-slate-100 text-sm text-slate-800 hover:bg-slate-50 ${
                  onRowClick ? "cursor-pointer" : ""
                } ${rowClassName?.(row.original) ?? ""}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
