"use client";

import { Fragment, type KeyboardEvent, type ReactNode, useState } from "react";
import {
  type ColumnDef,
  type RowData,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { GripVertical } from "lucide-react";

import { Input } from "@/components/ui/shadcn/input";
import { useKeyboardReorder } from "@/components/ui/use-keyboard-reorder";
import { EditableCell } from "@/components/widgets/EditableCell";
import { ROW_ACTIONS_HEADER, ROW_ACTIONS_WIDTH, RowActionsMenu, rowDeleteKeyDown } from "@/components/widgets/RowActionsMenu";
import { cellEditState, type AnyCellEdit, type CanEdit } from "@/components/widgets/editable-cell";
import type { TableRowActionsProps, TableSelectionProps } from "@/components/widgets/table-rows";
import {
  HeaderSelectCheckbox,
  RowSelectCheckbox,
  SELECT_CELL_CLASS,
  useTableSelection,
} from "@/components/widgets/table-selection";
import {
  CellGridContext,
  GRID_CELL_CLASS,
  GRID_GROUP_ATTR,
  GRID_ROW_CLASS,
  useCellGrid,
} from "@/components/widgets/use-cell-grid";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TValue must match the original declaration
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Editable cell (#1024); without it the column is calculated and inert. */
    edit?: AnyCellEdit<TData>;
    /** true, or the reason shown when the viewer clicks a locked cell */
    canEdit?(row: TData): ReturnType<CanEdit<TData>>;
    /** Field name of an editable column for its toast and search ("Responsable"); defaults to the column id. */
    editLabel?: string;
  }
}

/**
 * Shared record table — sticky header, sortable columns, an optional built-in
 * search box, empty/loading states. Columns with `meta.edit` (#1024) make the
 * table a keyboard grid whose editable cells open `CellEditor` (see
 * `use-cell-grid`); clicks on them never reach `onRowClick`. Replaces the hand-rolled `<table>` markup
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
  /**
   * The row's name for its grip button ("Mover {nombre}") and the keyboard
   * reorder announcements (Space lifts, ↑ / ↓ move, Space drops, Escape
   * cancels). Defaults to the row id.
   */
  getRowLabel?: (row: T) => string;
  /** Header of the grip column (e.g. "Orden"); empty and hidden by default. */
  reorderHeader?: ReactNode;
  /** Extra classes per header cell, by column id. */
  headerClassName?: (columnId: string) => string | undefined;
  /** Extra classes per body cell, by column id and row. */
  cellClassName?: (columnId: string, row: T) => string | undefined;
  /** Rows rendered in a `<tfoot>` below the body (e.g. a totals row); hidden while loading or empty. */
  footer?: ReactNode;
  /**
   * Groups the (sorted) rows by this key, in order of first appearance, with
   * a full-width header row per group rendered by `renderGroupHeader`.
   */
  groupBy?: (row: T) => string;
  renderGroupHeader?: (group: string, rows: T[]) => ReactNode;
} & TableSelectionProps<T> &
  TableRowActionsProps<T>;

function groupRows<R>(rows: R[], keyOf: (row: R) => string): { key: string; rows: R[] }[] {
  const groups = new Map<string, R[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return Array.from(groups, ([key, groupRowsList]) => ({ key, rows: groupRowsList }));
}

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
  selectable,
  selectedIds,
  onSelectionChange,
  getRowLabel,
  reorderHeader,
  headerClassName,
  cellClassName,
  footer,
  groupBy,
  renderGroupHeader,
  rowActions,
  onRowDelete,
}: DataTableProps<T>): ReactNode {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = useState("");
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const reorderEnabled = Boolean(onReorderRows) && sorting.length === 0 && !globalFilter;
  const editable = columns.some((column) => column.meta?.edit !== undefined);
  const grid = useCellGrid(editable);

  // TanStack Table returns a mutable instance the React Compiler cannot memoize, so the compiler
  // skips this component (the app does not run the compiler today). Expected, not a defect.
  // eslint-disable-next-line react-hooks/incompatible-library -- useReactTable is not compiler-safe
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

  const sortedRows = table.getRowModel().rows;
  const groups = groupBy ? groupRows(sortedRows, (row) => groupBy(row.original)) : null;
  const shownRows = groups ? groups.flatMap((g) => g.rows) : sortedRows;
  const rowById = new Map(shownRows.map((row) => [row.id, row]));
  const keyboard = useKeyboardReorder({
    ids: shownRows.map((row) => row.id),
    labelOf: (id) => {
      const row = rowById.get(id);
      return row && getRowLabel ? getRowLabel(row.original) : id;
    },
    onReorder: (orderedIds) => onReorderRows?.(orderedIds),
  });
  // While a row is lifted with the keyboard, the rows show in its preview order.
  const rows = keyboard.liftedId
    ? keyboard.order.map((id) => rowById.get(id)).filter((row): row is (typeof shownRows)[number] => Boolean(row))
    : shownRows;
  const rowOrder = rows.map((row) => row.id);
  const selection = useTableSelection<T>({ selectable, selectedIds, onSelectionChange }, rowOrder);
  const colSpan = (selection.enabled ? 1 : 0) + columns.length + (reorderEnabled ? 1 : 0) + (rowActions ? 1 : 0);
  const groupStarts = new Map((groups ?? []).map((g) => [g.rows[0].id, g] as const));

  const view = (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${wrapperClassName}`}
      {...(editable ? grid.rootProps : {})}
      {...(selection.enabled
        ? {
            onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
              grid.rootProps.onKeyDown(event);
              selection.onKeyDown(event);
            },
          }
        : {})}
    >
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

      <Table className={tableClassName} role={editable ? "grid" : undefined}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {selection.enabled ? (
                <TableHead data-slot="row-select-head" className={SELECT_CELL_CLASS}>
                  <HeaderSelectCheckbox selection={selection} ids={rowOrder} />
                </TableHead>
              ) : null}
              {reorderEnabled ? (
                reorderHeader ? (
                  <TableHead className="w-8">{reorderHeader}</TableHead>
                ) : (
                  <TableHead className="w-8" aria-hidden />
                )
              ) : null}
              {headerGroup.headers.map((header) => {
                const sortable = header.column.getCanSort();
                return (
                  <TableHead
                    key={header.id}
                    className={`${sortable ? "cursor-pointer select-none" : ""} ${headerClassName?.(header.column.id) ?? ""}`}
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
              {rowActions ? (
                <TableHead data-slot="row-actions-head" style={{ width: ROW_ACTIONS_WIDTH }}>
                  <span className="sr-only">{ROW_ACTIONS_HEADER}</span>
                </TableHead>
              ) : null}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">
                {loadingMessage}
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <Fragment key={row.id}>
                {groupStarts.has(row.id) && renderGroupHeader ? (
                  <TableRow data-slot="group-row" className="hover:bg-transparent">
                    <TableCell colSpan={colSpan}>
                      {renderGroupHeader(groupStarts.get(row.id)!.key, groupStarts.get(row.id)!.rows.map((r) => r.original))}
                    </TableCell>
                  </TableRow>
                ) : null}
                <TableRow
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowDelete ? (event) => rowDeleteKeyDown(event, () => onRowDelete(row.original)) : undefined}
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
                  data-lifted={keyboard.liftedId === row.id ? "true" : undefined}
                  data-state={selection.isSelected(row.id) ? "selected" : undefined}
                  {...(editable ? { [GRID_GROUP_ATTR]: groupBy ? groupBy(row.original) : "" } : {})}
                  className={`${onRowClick ? "cursor-pointer" : ""} ${dragOverRowId === row.id || keyboard.liftedId === row.id ? "bg-muted" : ""} ${rowClassName?.(row.original) ?? ""}${editable ? ` ${GRID_ROW_CLASS}` : ""}${rowActions ? " group/row" : ""}`}
                >
                  {selection.enabled ? (
                    <TableCell data-slot="row-select-cell" className={SELECT_CELL_CLASS} onClick={(e) => e.stopPropagation()}>
                      <RowSelectCheckbox selection={selection} id={row.id} label={getRowLabel?.(row.original) ?? row.id} />
                    </TableCell>
                  ) : null}
                  {reorderEnabled ? (
                    <TableCell className="w-8 text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        {...keyboard.handleProps(row.id)}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          setDragRowId(row.id);
                        }}
                        onDragEnd={() => {
                          setDragRowId(null);
                          setDragOverRowId(null);
                        }}
                        title="Arrastra para reordenar"
                        className="inline-flex size-7 cursor-grab items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                      >
                        <GripVertical aria-hidden="true" className="size-4" />
                      </button>
                    </TableCell>
                  ) : null}
                  {row.getVisibleCells().map((cell) => {
                    const content = flexRender(cell.column.columnDef.cell, cell.getContext());
                    if (!editable) {
                      return (
                        <TableCell key={cell.id} className={cellClassName?.(cell.column.id, row.original)}>
                          {content}
                        </TableCell>
                      );
                    }
                    const meta = cell.column.columnDef.meta;
                    const state = cellEditState(row.original, meta?.edit, meta?.canEdit?.bind(meta)).state;
                    return (
                      <TableCell
                        key={cell.id}
                        {...grid.cellProps(row.id, cell.column.id, state)}
                        className={`${cellClassName?.(cell.column.id, row.original) ?? ""} ${GRID_CELL_CLASS}`}
                      >
                        <EditableCell<T>
                          row={row.original}
                          rowId={row.id}
                          columnKey={cell.column.id}
                          edit={meta?.edit}
                          canEdit={meta?.canEdit?.bind(meta)}
                          label={
                            meta?.editLabel ??
                            (typeof cell.column.columnDef.header === "string" ? cell.column.columnDef.header : undefined)
                          }
                        >
                          {content}
                        </EditableCell>
                      </TableCell>
                    );
                  })}
                  {rowActions ? (
                    <TableCell data-slot="row-actions-cell" className="w-10 px-1 py-0 text-right" onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu
                        rowLabel={getRowLabel?.(row.original) ?? row.id}
                        actions={rowActions(row.original)}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              </Fragment>
            ))
          )}
        </TableBody>
        {footer && !isLoading && rows.length > 0 ? <TableFooter>{footer}</TableFooter> : null}
      </Table>
      {reorderEnabled ? (
        <p aria-live="polite" className="sr-only">
          {keyboard.announcement}
        </p>
      ) : null}
    </div>
  );
  return editable ? <CellGridContext.Provider value={grid.api}>{view}</CellGridContext.Provider> : view;
}
