"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import type { CellContext, ColumnDef, ColumnMeta } from "@tanstack/react-table";
import { toast } from "sonner";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { DataTable } from "@/components/ui/DataTable";
import ExportMenu from "@/components/ui/ExportMenu";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { TableCell, TableRow } from "@/components/ui/shadcn/table";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { RowActionsMenu, createRowActionsColumn, type RowAction } from "@/components/v2/table/RowActionsMenu";
import { RowActionsMenu as RowMenu, rowDeleteKeyDown } from "@/components/widgets/RowActionsMenu";
import type { TableRowActionsProps, TableSelectionProps } from "@/components/widgets/table-rows";
import { RowSelectCheckbox, useTableSelection } from "@/components/widgets/table-selection";
import { actionErrorText } from "@/lib/errors";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { RecordColumn, RecordTableData } from "@/lib/types/widgets";
import type { WidgetView } from "@/lib/stores/dashboard-store";
import { exportTableData, type ExportFormat, type ExportValue } from "@/lib/utils/export-service";

import {
  columnAlign,
  columnMono,
  computeTotals,
  formatCell,
  formatTotal,
  groupLabel,
  HEAT_CELL_CLASS,
  heatLevel,
  isNegativeDelta,
  rowId,
  visibleColumns,
} from "./record-table-format";
import { StyleView } from "./StyleView";

/**
 * The table of the widget library (redesign FE §4.10.1, §15.2); extends
 * `components/ui/DataTable` with `RowActionsMenu`, bulk select,
 * `BulkActionBar` and `ExportMenu`. Cells format by `column.format` unless
 * `renderCell` returns a node; columns with `hideOn` are dropped per style.
 *
 * - Visual: rows inside a card, 14 px, groups under a header with a count.
 * - Esencial: plain list (title + "label value" meta), no heat, no totals.
 * - Analítico: dense table, 12.5 px (headers 11.5 px on `muted`), mono
 *   right-aligned numbers, heat cells and the totals row.
 *
 * With `selectable`, the selected rows can be exported (Excel / PDF).
 * With `onEndReached` (opt-in pagination), a "Cargar más" button under the
 * rows asks the page for the next rows while `hasMore`.
 *
 * Columns with `edit` (#1024) make the Visual and Analítico tables a keyboard
 * grid with editable cells (through `DataTable`'s column meta); the Esencial
 * list stays read-only.
 */
export type RecordTableProps = {
  data: RecordTableData;
  renderCell?: (columnKey: string, row: Record<string, unknown>) => ReactNode | undefined;
  density?: "comoda" | "compacta";
  selectable?: boolean;
  rowActions?: RowAction<Record<string, unknown>>[];
  /**
   * Per-row `⋯` menu and Supr (#1041), through `DataTable`'s trailing actions
   * column; `getRowLabel` names the row in the menu's label.
   */
  rowMenu?: TableRowActionsProps<Record<string, unknown>> & { getRowLabel?(row: Record<string, unknown>): string };
  /**
   * Controlled row checkboxes (#1040): the leading checkbox column of
   * `DataTable` (a checkbox per item in Esencial). The page owns the
   * selection and its bar; unlike `selectable` there is no export bar here.
   */
  rowSelection?: TableSelectionProps<Record<string, unknown>>;
  emptyState?: EmptyStateProps;
  /** Opt-in pagination: called by "Cargar más" under the rows. */
  onEndReached?: () => void;
  /** More rows after these; without it "Cargar más" isn't shown. */
  hasMore?: boolean;
  /** The next rows are loading: "Cargar más" is disabled. */
  loadingMore?: boolean;
  /** Dashboard override (`StyleView`): "table" renders the Analítico table whatever the style. */
  view?: WidgetView;
};

/** "Cargar más" under a paginated `RecordTable`. */
export const RECORD_TABLE_LOAD_MORE = "Cargar más";

type Row = Record<string, unknown>;

/** Empty-state copy when the caller passes none (same as `DataTable`). */
export const RECORD_TABLE_EMPTY_TITLE = "No hay resultados";

const EXPORT_COMPANY = "Cincel";
const EXPORT_NAME = "Registros";

export function RecordTable(props: RecordTableProps) {
  if (props.data.rows.length === 0) {
    return <EmptyState {...(props.emptyState ?? { title: RECORD_TABLE_EMPTY_TITLE })} />;
  }
  const view = (
    <StyleView
      view={props.view}
      visual={() => <TableView {...props} style="visual" />}
      esencial={() => <ListView {...props} />}
      analitico={() => <TableView {...props} style="analitico" />}
    />
  );
  if (!props.onEndReached || !props.hasMore) return view;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {view}
      <div className="flex justify-center">
        <Button type="button" variant="outline" size="sm" disabled={props.loadingMore} onClick={props.onEndReached}>
          {props.loadingMore ? "Cargando…" : RECORD_TABLE_LOAD_MORE}
        </Button>
      </div>
    </div>
  );
}

/** Loading state of a `RecordTable`: the `list` skeleton in Esencial, `table` otherwise. */
export function RecordTableSkeleton({ rows }: { rows?: number }) {
  return (
    <StyleView
      visual={() => <LoadingSkeleton variant="table" rows={rows} />}
      esencial={() => <LoadingSkeleton variant="list" rows={rows} />}
      analitico={() => <LoadingSkeleton variant="table" rows={rows} />}
    />
  );
}

function cellContent(column: RecordColumn, row: Row, renderCell: RecordTableProps["renderCell"]): ReactNode {
  const custom = renderCell?.(column.key, row);
  return custom !== undefined ? custom : formatCell(column, row);
}

/** What `RecordCell` reads from its column's meta: this render's column and `renderCell`. */
type RecordCellMeta = ColumnMeta<Row, unknown> & {
  record: RecordColumn;
  renderCell: RecordTableProps["renderCell"];
};

/**
 * The `cell` of every data column: one module-level component, so a
 * re-render (a new `renderCell` closure) updates the cell instead of
 * remounting it, and a focused control inside keeps its element.
 */
function RecordCell({ row, column }: CellContext<Row, unknown>): ReactNode {
  const meta = column.columnDef.meta as RecordCellMeta | undefined;
  if (!meta) return null;
  return cellContent(meta.record, row.original, meta.renderCell);
}

function useSelection(rows: Row[]) {
  const [selected, setSelected] = useState<ReadonlySet<string | number>>(new Set());
  const ids = useMemo(() => rows.map((row, index) => rowId(row, index)), [rows]);
  const toggle = (id: string | number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = (all: (string | number)[]) =>
    setSelected((prev) => (all.length > 0 && all.every((id) => prev.has(id)) ? new Set() : new Set(all)));
  const clear = () => setSelected(new Set());
  const selectedRows = rows.filter((_, index) => selected.has(ids[index]));
  return { selected, ids, toggle, toggleAll, clear, selectedRows };
}

type Selection = ReturnType<typeof useSelection>;

function exportValue(value: unknown): ExportValue {
  if (value === null || value === undefined || value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function SelectionBar({ columns, selection }: { columns: RecordColumn[]; selection: Selection }) {
  const onExport = async (format: ExportFormat) => {
    try {
      await exportTableData<Row>({
        moduleName: EXPORT_NAME,
        fileName: EXPORT_NAME.toLowerCase(),
        format,
        companyName: EXPORT_COMPANY,
        columns: columns.map((column) => ({
          key: column.key,
          header: column.label,
          isDate: column.format === "date",
          getValue: (row) => exportValue(row[column.key]),
        })),
        rows: selection.selectedRows,
      });
    } catch (err) {
      toast.error(actionErrorText(err));
    }
  };
  return (
    <BulkActionBar
      selectedCount={selection.selectedRows.length}
      itemLabel="filas"
      actions={[{ label: "Quitar selección", onClick: selection.clear }]}
    >
      <ExportMenu onExport={onExport} scaleClassName="scale-100" />
    </BulkActionBar>
  );
}

function TableView({
  data,
  renderCell,
  density,
  selectable,
  rowActions,
  rowMenu,
  rowSelection,
  style,
}: RecordTableProps & { style: Extract<PresentationStyle, "visual" | "analitico"> }) {
  const analitico = style === "analitico";
  const columns = visibleColumns(data.columns, style);
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const selection = useSelection(data.rows);
  const indexOf = useMemo(() => new Map(data.rows.map((row, index) => [row, index])), [data.rows]);
  const idOf = (row: Row) => rowId(row, indexOf.get(row) ?? 0);
  const compact = (density ?? (analitico ? "compacta" : "comoda")) === "compacta";
  const hasActions = Boolean(rowActions && rowActions.length > 0);
  const hasSelection = Boolean(selectable) && selection.selectedRows.length > 0;

  const defs: ColumnDef<Row, unknown>[] = [
    ...(selectable
      ? [
          createSelectionColumn<Row>({
            getId: idOf,
            selectedIds: selection.selected,
            onToggle: selection.toggle,
            onToggleAll: selection.toggleAll,
          }),
        ]
      : []),
    ...columns.map(
      (column): ColumnDef<Row, unknown> => ({
        id: column.key,
        accessorFn: (row) => row[column.key],
        header: () => (
          <span style={column.width ? { display: "inline-block", minWidth: column.width } : undefined}>
            {column.label}
            {column.badge ? (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-px align-middle">
                {column.badge}
              </Badge>
            ) : null}
          </span>
        ),
        cell: RecordCell,
        meta: {
          record: column,
          renderCell,
          edit: column.edit,
          canEdit: column.canEdit,
          editLabel: column.label,
        } satisfies RecordCellMeta as RecordCellMeta,
      }),
    ),
    ...(hasActions ? [createRowActionsColumn<Row>(() => rowActions ?? [])] : []),
  ];

  const alignClass = (column: RecordColumn) =>
    [
      columnAlign(column) === "right" ? "text-right tabular-nums" : "",
      columnMono(column, style) ? "font-mono" : "",
    ]
      .filter(Boolean)
      .join(" ");

  const padding = compact ? "py-1" : "py-2.5";

  const totals = analitico ? computeTotals(data, columns) : null;
  const footer = totals ? (
    <TableRow data-slot="totals-row">
      {rowSelection?.selectable ? <TableCell /> : null}
      {selectable ? <TableCell /> : null}
      {columns.map((column) => (
        <TableCell key={column.key} data-column={column.key} className={`py-1 font-semibold ${alignClass(column)}`}>
          {formatTotal(column, totals)}
        </TableCell>
      ))}
      {hasActions ? <TableCell /> : null}
      {rowMenu?.rowActions ? <TableCell /> : null}
    </TableRow>
  ) : undefined;

  const wrapper = [
    analitico ? "rounded-[10px]! shadow-none!" : "",
    hasSelection ? "rounded-t-none! border-t-0!" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div data-slot="record-table" data-style={style}>
      {selectable ? <SelectionBar columns={columns} selection={selection} /> : null}
      <DataTable<Row>
        columns={defs}
        data={data.rows}
        getRowId={(row, index) => rowId(row, index)}
        rowClassName={(row) => (selectable && selection.selected.has(idOf(row)) ? "bg-muted" : undefined)}
        headerClassName={(id) => {
          const column = byKey.get(id);
          return [column ? alignClass(column) : "", analitico ? "h-8 text-[11.5px] text-muted-foreground" : ""]
            .filter(Boolean)
            .join(" ");
        }}
        cellClassName={(id, row) => {
          const column = byKey.get(id);
          if (!column) return padding;
          const heat = analitico ? heatLevel(data.heat, column.key, row[column.key]) : null;
          return [
            padding,
            alignClass(column),
            heat ? HEAT_CELL_CLASS[heat] : "",
            isNegativeDelta(column, row) ? "text-destructive" : "",
          ]
            .filter(Boolean)
            .join(" ");
        }}
        tableClassName={analitico ? "text-[12.5px] [&_thead_tr]:bg-muted" : "text-sm"}
        wrapperClassName={wrapper}
        footer={footer}
        groupBy={data.groupBy ? (row) => groupLabel(data, row) : undefined}
        renderGroupHeader={(label, rows) =>
          analitico ? (
            <span data-slot="group-header" className="flex items-center gap-2 text-[11.5px] font-semibold">
              <span>{label}</span>
              <span className="font-mono text-muted-foreground">{rows.length}</span>
            </span>
          ) : (
            <span data-slot="group-header" className="flex items-center gap-2 text-sm font-semibold">
              <span>{label}</span>
              <Badge variant="secondary">{rows.length}</Badge>
            </span>
          )
        }
        emptyMessage={RECORD_TABLE_EMPTY_TITLE}
        rowActions={rowMenu?.rowActions}
        onRowDelete={rowMenu?.onRowDelete}
        getRowLabel={rowMenu?.getRowLabel ?? rowSelection?.getRowLabel}
        selectable={rowSelection?.selectable}
        selectedIds={rowSelection?.selectedIds}
        onSelectionChange={rowSelection?.onSelectionChange}
      />
    </div>
  );
}

function ListView({ data, renderCell, density, selectable, rowActions, rowMenu, rowSelection }: RecordTableProps) {
  const baseId = useId();
  const columns = visibleColumns(data.columns, "esencial");
  const [title, ...meta] = columns;
  const selection = useSelection(data.rows);
  const picked = useTableSelection(rowSelection ?? {}, selection.ids);
  const compact = density === "compacta";
  const hasActions = Boolean(rowActions && rowActions.length > 0);

  const groups: { label: string; items: { row: Row; index: number }[] }[] = [];
  data.rows.forEach((row, index) => {
    const label = groupLabel(data, row);
    const group = groups.find((g) => g.label === label);
    if (group) group.items.push({ row, index });
    else groups.push({ label, items: [{ row, index }] });
  });

  const renderItem = ({ row, index }: { row: Row; index: number }) => {
    const id = selection.ids[index];
    return (
      <li
        key={id}
        data-slot="record-item"
        className={`group/row flex items-start gap-3 px-4 ${compact ? "py-2" : "py-3"}`}
        onKeyDown={rowMenu?.onRowDelete ? (event) => rowDeleteKeyDown(event, () => rowMenu.onRowDelete?.(row)) : undefined}
      >
        {picked.enabled ? (
          <span className="mt-1">
            <RowSelectCheckbox selection={picked} id={id} label={rowSelection?.getRowLabel?.(row) ?? id} />
          </span>
        ) : null}
        {selectable ? (
          <Checkbox
            className="mt-1"
            checked={selection.selected.has(id)}
            onCheckedChange={() => selection.toggle(id)}
            aria-label="Seleccionar fila"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          {title ? (
            <div data-column={title.key} className="text-[15px] text-foreground">
              {cellContent(title, row, renderCell)}
            </div>
          ) : null}
          {meta.length > 0 ? (
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
              {meta.map((column) => (
                <span key={column.key} data-column={column.key}>
                  {column.label}{" "}
                  <span className={`text-foreground${columnMono(column, "esencial") ? " font-mono" : ""}`}>
                    {cellContent(column, row, renderCell)}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {hasActions ? <RowActionsMenu row={row} actions={rowActions ?? []} /> : null}
        {rowMenu?.rowActions ? (
          <RowMenu rowLabel={rowMenu.getRowLabel?.(row) ?? String(id)} actions={rowMenu.rowActions(row)} />
        ) : null}
      </li>
    );
  };

  return (
    <div data-slot="record-table" data-style="esencial" className="flex flex-col gap-4">
      {selectable ? <SelectionBar columns={columns} selection={selection} /> : null}
      {groups.map((group, groupIndex) => {
        const headingId = data.groupBy ? `${baseId}-group-${groupIndex}` : undefined;
        return (
          <section key={`${groupIndex}-${group.label}`} className="flex flex-col gap-2">
            {headingId ? (
              <p id={headingId} data-slot="group-header" className="text-[13px] font-semibold text-foreground">
                {group.label} <span className="font-normal text-muted-foreground">· {group.items.length}</span>
              </p>
            ) : null}
            <ul aria-labelledby={headingId} className="divide-y divide-border rounded-xl border border-border bg-card">
              {group.items.map(renderItem)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
