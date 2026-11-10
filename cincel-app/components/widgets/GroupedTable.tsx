"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { ErrorState } from "@/components/shell/ErrorState";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { EditableCell } from "@/components/widgets/EditableCell";
import { OPEN_TASK_LABEL, cellEditState } from "@/components/widgets/editable-cell";
import type { TableRowActionsProps, TableSelectionProps } from "@/components/widgets/table-rows";
import {
  HEAT_CELL_CLASS,
  columnAlign,
  columnMono,
  computeTotals,
  formatCell,
  formatTotal,
  heatLevel,
  rowId,
  visibleColumns,
  type HeatLevel,
} from "@/components/widgets/record-table-format";
import {
  CellGridContext,
  GRID_CELL_CLASS,
  GRID_GROUP_ATTR,
  GRID_ROW_CLASS,
  useCellGrid,
  type UseCellGrid,
} from "@/components/widgets/use-cell-grid";
import type { RecordColumn } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

/**
 * Analítico grouped table (ADR 0005, frames `Main`, `Analitico-Vencidas`,
 * `Proyectos-Analitico`): one card per top group, a second collapsible level
 * (e.g. project → tramo), metrics in each group header, heat cells, footer
 * totals, "Ir a" anchors and a totals bar under the last card. `layout:
 * "table"` puts every top group in one table instead (group rows, one
 * `tfoot` from `footerRow`).
 *
 * Expansion is uncontrolled by default (`defaultExpanded`) or controlled with
 * `expanded` + `onExpandedChange`; `onGroupExpand` fires on each expand so
 * pages can lazy-load rows (a group whose `rows` is undefined shows skeleton
 * rows until they arrive). Rows come sorted by the caller.
 *
 * Columns with `edit` (#1024) make the tables one keyboard grid
 * (`use-cell-grid`): their cells open `CellEditor` on click, Enter or F2, and
 * a row whose group changes after a save moves there and flashes once. A
 * first column with `edit` edits on click; its open icon and ⌘/Ctrl-click
 * follow `rowHref`. Without editable columns nothing changes.
 */
export type HeatRule = { key: string; warnAt: number; critAt: number; direction?: "above" | "below" };
export type GroupMetric = {
  key: string;
  label?: string;
  value: string;
  tone?: "default" | "muted" | "destructive" | "warning" | "success";
  pill?: boolean;
  /** Top group header: the label before the value ("Vencidas **7**") instead of after it. */
  labelFirst?: boolean;
};
export type GroupFooter = "auto" | Record<string, string | number>;
export type Group<Row> = {
  id: string;
  label: string;
  color?: string;
  caption?: string;
  metrics: GroupMetric[];
  rows?: Row[];
  children?: Group<Row>[];
  footer?: GroupFooter;
  quickAdd?: ReactNode;
  loading?: boolean;
  hasMore?: boolean;
  hidden?: boolean;
};
export type GroupAnchor = { groupId: string; label: string; count: number; tone?: "destructive" | "muted" };
export type GroupedTableProps<Row extends Record<string, unknown>> = {
  label: string;
  columns: RecordColumn<Row>[];
  groups: Group<Row>[];
  totals?: { label: string; summary: string };
  /**
   * "cards" (default): one card per top group. "table": one card and one
   * table, each top group a collapsible group row (`tr id={group id}`) over
   * its rows, `footerRow` as the table's `tfoot` (frame `Proyectos-Analitico`).
   */
  layout?: "cards" | "table";
  /** "table" layout: the footer cell of each column (preformatted strings, or numbers in the column's format). */
  footerRow?: Record<string, string | number>;
  anchors?: GroupAnchor[];
  anchorsCaption?: string;
  /** "Expandir todo" / "Contraer todo" above the groups (default true); false when the page has its own. */
  toggleAll?: boolean;
  defaultExpanded?: boolean | string[];
  expanded?: string[];
  onExpandedChange?(ids: string[]): void;
  heat?: HeatRule[];
  getRowId?(row: Row, index: number): string;
  renderCell?(columnKey: string, row: Row): ReactNode | undefined;
  rowHref?(row: Row): string | null;
  isRowNew?(row: Row): boolean;
  isRowMuted?(row: Row): boolean;
  onGroupExpand?(groupId: string): void;
  onLoadMore?(groupId: string): void;
  loading?: boolean;
  error?: { title?: string; onRetry?(): void };
  emptyState?: EmptyStateProps;
  /** Column keys whose header is a sort button (`aria-sort`); the caller sorts the rows. */
  sortable?: string[];
  sort?: { key: string; direction: "asc" | "desc" } | null;
  onSortChange?(key: string): void;
} & TableSelectionProps<Row> &
  TableRowActionsProps<Row>;

/** `aria-sort` of a header under the current sort. */
export function ariaSortOf(
  key: string,
  sort: GroupedTableProps<Record<string, unknown>>["sort"],
): "ascending" | "descending" | "none" {
  if (!sort || sort.key !== key) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

/** Heat level of a cell under its rule. */
export type { HeatLevel };

export const GROUPED_TABLE_EMPTY_TITLE = "No hay resultados";
export const EXPAND_ALL_LABEL = "Expandir todo";
export const COLLAPSE_ALL_LABEL = "Contraer todo";
export const LOAD_MORE_LABEL = "Cargar más";
export const NEW_ROW_LABEL = "Nueva";
export const ANCHORS_LABEL = "Ir a";

/** Width of a column without `width` (7 columns ≈ 860 px, frame `Main`). */
const DEFAULT_COLUMN_WIDTH = 123;
const SKELETON_ROWS = 3;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Visible groups (not `hidden`) with their visible children. */
function visibleGroups<Row>(groups: Group<Row>[]): Group<Row>[] {
  return groups
    .filter((group) => !group.hidden)
    .map((group) => (group.children ? { ...group, children: visibleGroups(group.children) } : group));
}

/** The rows of a group and of all its descendants, in order. */
function leafRows<Row>(group: Group<Row>): Row[] {
  return [...(group.rows ?? []), ...(group.children ?? []).flatMap(leafRows)];
}

/** Every id of both levels, each top group before its children. */
function allIds<Row>(groups: Group<Row>[]): string[] {
  return groups.flatMap((group) => [group.id, ...allIds(group.children ?? [])]);
}

function findGroup<Row>(groups: Group<Row>[], id: string): Group<Row> | undefined {
  for (const group of groups) {
    if (group.id === id) return group;
    const child = findGroup(group.children ?? [], id);
    if (child) return child;
  }
  return undefined;
}

/** A DOM-safe id from a prefix and a group id. */
function domId(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** Section id of a top group (the "Ir a" anchor target). */
export function groupAnchorId(groupId: string): string {
  // The group id itself (made DOM-safe): pages link to their groups by id.
  return groupId.replace(/[^A-Za-z0-9_-]/g, "_");
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

function hasChildren<Row>(group: Group<Row>): boolean {
  return (group.children?.length ?? 0) > 0;
}

/** True when a group still waits for its rows (loading, or lazy rows not given yet). */
function isPending<Row>(group: Group<Row>): boolean {
  return group.loading === true || (group.rows === undefined && !hasChildren(group));
}

const METRIC_TEXT: Record<NonNullable<GroupMetric["tone"]>, string> = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  destructive: "text-destructive",
  warning: "text-warning-ink",
  success: "text-success",
};

const METRIC_BADGE: Record<NonNullable<GroupMetric["tone"]>, "warning" | "destructive" | "success" | "secondary"> = {
  default: "secondary",
  muted: "secondary",
  destructive: "destructive",
  warning: "warning",
  success: "success",
};

function metricText(metric: GroupMetric): string {
  return metric.label ? `${metric.value} ${metric.label}` : metric.value;
}

/** Top group header metrics: values in `<b>`, pills as `Badge`. */
function TopMetrics({ metrics }: { metrics: GroupMetric[] }) {
  if (metrics.length === 0) return null;
  return (
    <span data-slot="group-metrics" className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12.5px] text-foreground-soft">
      {metrics.map((metric) =>
        metric.pill ? (
          <Badge key={metric.key} variant={METRIC_BADGE[metric.tone ?? "default"]} data-metric={metric.key}>
            {metricText(metric)}
          </Badge>
        ) : (
          <span key={metric.key} data-metric={metric.key}>
            {metric.labelFirst && metric.label ? `${metric.label} ` : null}
            <b className={cn("font-semibold", METRIC_TEXT[metric.tone ?? "default"])}>{metric.value}</b>
            {!metric.labelFirst && metric.label ? ` ${metric.label}` : null}
          </span>
        ),
      )}
    </span>
  );
}

/** Second-level metrics joined by " · ", destructive parts in `destructive`. */
function ChildMetrics({ metrics }: { metrics: GroupMetric[] }) {
  if (metrics.length === 0) return null;
  return (
    <span data-slot="group-metrics" className="font-mono font-normal text-foreground-soft">
      {metrics.map((metric, index) => (
        <Fragment key={metric.key}>
          {index > 0 ? " · " : null}
          <span data-metric={metric.key} className={metric.tone === "destructive" ? "text-destructive" : undefined}>
            {metricText(metric)}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

type Ctx<Row extends Record<string, unknown>> = {
  props: GroupedTableProps<Row>;
  columns: RecordColumn[];
  /** The keyboard grid, when a column is editable. */
  grid: UseCellGrid | null;
  isOpen(id: string): boolean;
  toggle(id: string): void;
};

/** Enter / Space toggle (handled here so the key never also fires a click). */
function headerKeyDown(event: KeyboardEvent<HTMLButtonElement>, toggle: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  toggle();
}

function isMonoColumn(column: RecordColumn): boolean {
  return columnMono(column, "analitico") || column.format === "date";
}

function cellClass(column: RecordColumn, first: boolean, heat: HeatLevel): string {
  const numeric = columnAlign(column) === "right";
  return cn(
    "border-b border-border px-3 py-[7px] whitespace-nowrap group-hover/row:bg-muted/50",
    first && "pl-10",
    numeric ? "text-right tabular-nums" : "overflow-hidden text-ellipsis",
    isMonoColumn(column) && "font-mono",
    heat && HEAT_CELL_CLASS[heat],
  );
}

/** The `<thead>` row: sortable headers are buttons with `aria-sort`; `badge` draws a pill after the label. */
function HeaderRow<Row extends Record<string, unknown>>({ ctx }: { ctx: Ctx<Row> }) {
  return (
    <tr>
      {ctx.columns.map((column, index) => {
        const sortable = ctx.props.sortable?.includes(column.key) ?? false;
        const label = (
          <>
            {column.label}
            {column.badge ? (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-px font-mono text-[10px] tracking-[.08em]">
                {column.badge}
              </Badge>
            ) : null}
          </>
        );
        return (
          <th
            key={column.key}
            scope="col"
            style={column.width ? { width: column.width } : undefined}
            className={cn(
              "border-b bg-muted px-3 py-2 font-mono text-[11px] font-medium tracking-[.08em] whitespace-nowrap text-muted-foreground uppercase",
              index === 0 && "pl-10",
              columnAlign(column) === "right" ? "text-right" : "text-left",
            )}
            aria-sort={sortable ? ariaSortOf(column.key, ctx.props.sort) : undefined}
          >
            {sortable ? (
              <button
                type="button"
                onClick={() => ctx.props.onSortChange?.(column.key)}
                className="inline-flex items-center gap-1 uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {label}
              </button>
            ) : (
              label
            )}
          </th>
        );
      })}
    </tr>
  );
}

/** A `tfoot` row from totals per column (first column indented like the rows). */
function FooterCells<Row extends Record<string, unknown>>({
  ctx,
  totals,
  slot,
}: {
  ctx: Ctx<Row>;
  totals: Record<string, string | number>;
  slot: string;
}) {
  return (
    <tr data-slot={slot}>
      {ctx.columns.map((column, index) => (
        <td
          key={column.key}
          data-column={column.key}
          className={cn(
            "bg-muted px-3 py-2 text-[12.5px] font-semibold whitespace-nowrap",
            index === 0 && "pl-10",
            columnAlign(column) === "right" && "text-right tabular-nums",
            index !== 0 && isMonoColumn(column) && "font-mono",
          )}
        >
          {formatTotal(column, totals)}
        </td>
      ))}
    </tr>
  );
}

function LeafRow<Row extends Record<string, unknown>>({
  ctx,
  row,
  index,
  groupId,
}: {
  ctx: Ctx<Row>;
  row: Row;
  index: number;
  groupId: string;
}) {
  const { props, columns, grid } = ctx;
  const isNew = props.isRowNew?.(row) ?? false;
  const muted = props.isRowMuted?.(row) ?? false;
  const id = props.getRowId?.(row, index) ?? rowId(row, index);
  return (
    <tr
      data-slot="leaf-row"
      data-row-id={id}
      {...(grid ? { [GRID_GROUP_ATTR]: groupId } : {})}
      className={cn("group/row", isNew && "row-new", grid && GRID_ROW_CLASS)}
    >
      {columns.map((column, columnIndex) => {
        const first = columnIndex === 0;
        const custom = props.renderCell?.(column.key, row);
        let content: ReactNode = custom !== undefined ? custom : formatCell(column, row);
        const href = first ? (props.rowHref?.(row) ?? null) : null;
        if (first) {
          content = (
            <span className="inline-flex max-w-full items-center gap-1.5">
              {href ? (
                <Link
                  href={href}
                  tabIndex={grid ? -1 : undefined}
                  className={cn(
                    "truncate underline decoration-border underline-offset-[3px]",
                    muted ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {content}
                </Link>
              ) : (
                <span className={cn("truncate", muted && "text-muted-foreground")}>{content}</span>
              )}
              {isNew ? (
                <Badge variant="secondary" className="text-[11px]">
                  {NEW_ROW_LABEL}
                </Badge>
              ) : null}
            </span>
          );
        }
        const heat = heatLevel(props.heat, column.key, row[column.key]);
        const edit = column.edit;
        if (grid && edit) {
          content = (
            <EditableCell row={row} rowId={id} columnKey={column.key} edit={edit} canEdit={column.canEdit} label={column.label}>
              {content}
              {href ? (
                <Link
                  href={href}
                  tabIndex={-1}
                  data-cell-open=""
                  aria-label={OPEN_TASK_LABEL}
                  title={OPEN_TASK_LABEL}
                  className="absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100 hover:bg-muted hover:text-foreground"
                >
                  <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </Link>
              ) : null}
            </EditableCell>
          );
        }
        return (
          <td
            key={column.key}
            data-column={column.key}
            data-heat={heat ?? undefined}
            {...(grid ? grid.cellProps(id, column.key, cellEditState(row, edit, column.canEdit).state) : {})}
            className={cn(cellClass(column, first, heat), grid && GRID_CELL_CLASS)}
            style={column.width && columnAlign(column) !== "right" ? { maxWidth: column.width } : undefined}
          >
            {content}
          </td>
        );
      })}
    </tr>
  );
}

/** The rows of a group that holds rows: leaf rows, skeleton, "Cargar más" and quick-add last. */
function GroupRows<Row extends Record<string, unknown>>({ ctx, group }: { ctx: Ctx<Row>; group: Group<Row> }) {
  const span = ctx.columns.length;
  return (
    <>
      {(group.rows ?? []).map((row, index) => (
        <LeafRow
          key={ctx.props.getRowId?.(row, index) ?? rowId(row, index)}
          ctx={ctx}
          row={row}
          index={index}
          groupId={group.id}
        />
      ))}
      {isPending(group) ? (
        <tr data-slot="group-loading">
          <td colSpan={span} className="border-b border-border px-3 py-2">
            <LoadingSkeleton variant="table" rows={SKELETON_ROWS} />
          </td>
        </tr>
      ) : null}
      {group.hasMore && !group.loading ? (
        <tr data-slot="load-more">
          <td colSpan={span} className="border-b border-border px-3 py-1 pl-10">
            <Button type="button" variant="link" size="sm" onClick={() => ctx.props.onLoadMore?.(group.id)}>
              {LOAD_MORE_LABEL}
            </Button>
          </td>
        </tr>
      ) : null}
      {group.quickAdd ?? null}
    </>
  );
}

function ChildGroup<Row extends Record<string, unknown>>({
  ctx,
  group,
  anchorId,
  setHeaderRef,
}: {
  ctx: Ctx<Row>;
  group: Group<Row>;
  /** "table" layout: the group row is the "Ir a" target. */
  anchorId?: string;
  setHeaderRef?(id: string, el: HTMLButtonElement | null): void;
}) {
  const open = ctx.isOpen(group.id);
  const toggle = () => ctx.toggle(group.id);
  const bodyId = domId("grupo-filas", group.id);
  return (
    <>
      <tbody data-slot="child-group" data-group-id={group.id}>
        <tr id={anchorId} className={anchorId ? "scroll-mt-12" : undefined}>
          <td colSpan={ctx.columns.length} className="border-b border-border p-0">
            <button
              ref={setHeaderRef ? (el) => setHeaderRef(group.id, el) : undefined}
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={toggle}
              onKeyDown={(event) => headerKeyDown(event, toggle)}
              className="flex w-full flex-wrap items-center gap-2.5 bg-muted/50 px-3 py-2 text-left text-[12.5px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <ChevronDown aria-hidden="true" className="chev size-3.5 shrink-0 text-muted-foreground" />
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-muted-foreground"
                style={group.color ? { backgroundColor: group.color } : undefined}
              />
              <span>{group.label}</span>
              {group.caption ? <span className="font-mono font-normal text-muted-foreground">{group.caption}</span> : null}
              <span className="flex-1" />
              <ChildMetrics metrics={group.metrics} />
            </button>
          </td>
        </tr>
      </tbody>
      <tbody id={bodyId} hidden={!open} data-slot="child-rows" className={open ? "anim-in" : undefined}>
        {open ? <GroupRows ctx={ctx} group={group} /> : null}
      </tbody>
    </>
  );
}

/** `<tfoot>` of a top group: "auto" totals over its loaded leaf rows; explicit values win per column. */
function GroupFooterRow<Row extends Record<string, unknown>>({ ctx, group }: { ctx: Ctx<Row>; group: Group<Row> }) {
  if (!group.footer) return null;
  const rows = leafRows(group);
  const first = ctx.columns[0]?.key;
  const auto: Record<string, string | number> = computeTotals({ columns: ctx.columns, rows, totals: "auto" }, ctx.columns) ?? {};
  if (first) auto[first] = `Total · ${rows.length} ${rows.length === 1 ? "tarea" : "tareas"}`;
  const totals = group.footer === "auto" ? auto : { ...auto, ...group.footer };
  return (
    <tfoot>
      <FooterCells ctx={ctx} totals={totals} slot="group-footer" />
    </tfoot>
  );
}

function TopGroup<Row extends Record<string, unknown>>({
  ctx,
  group,
  setHeaderRef,
}: {
  ctx: Ctx<Row>;
  group: Group<Row>;
  setHeaderRef(id: string, el: HTMLButtonElement | null): void;
}) {
  const open = ctx.isOpen(group.id);
  const toggle = () => ctx.toggle(group.id);
  const bodyId = domId("grupo-cuerpo", group.id);
  const minWidth = ctx.columns.reduce((sum, column) => sum + (column.width ?? DEFAULT_COLUMN_WIDTH), 0);
  const children = group.children ?? [];
  const ownRows = group.rows !== undefined || !hasChildren(group) || group.loading === true;
  return (
    <section
      id={groupAnchorId(group.id)}
      aria-label={group.label}
      data-slot="group-card"
      className="scroll-mt-4 overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]"
    >
      <button
        ref={(el) => setHeaderRef(group.id, el)}
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
        onKeyDown={(event) => headerKeyDown(event, toggle)}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <ChevronDown aria-hidden="true" className="chev size-4 shrink-0 text-muted-foreground" />
        {group.color ? (
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
        ) : null}
        <span className="text-[15px] font-semibold text-foreground">{group.label}</span>
        {group.caption ? <span className="font-mono text-[12.5px] text-muted-foreground">{group.caption}</span> : null}
        <span className="flex-1" />
        <TopMetrics metrics={group.metrics} />
      </button>
      <div id={bodyId} hidden={!open} className={open ? "anim-in" : undefined}>
        {open ? (
          <div className="overflow-x-auto border-t">
            <table
              aria-label={`${ctx.props.label} · ${group.label}`}
              role={ctx.grid ? "grid" : undefined}
              className="w-full border-collapse text-[12.5px]"
              style={{ minWidth }}
            >
              <thead className="sticky top-0">
                <HeaderRow ctx={ctx} />
              </thead>
              {ownRows ? (
                <tbody data-slot="group-rows">
                  <GroupRows ctx={ctx} group={group} />
                </tbody>
              ) : null}
              {children.map((child) => (
                <ChildGroup key={child.id} ctx={ctx} group={child} />
              ))}
              <GroupFooterRow ctx={ctx} group={group} />
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function GroupedTable<Row extends Record<string, unknown>>(p: GroupedTableProps<Row>): ReactNode {
  const groups = useMemo(() => visibleGroups(p.groups), [p.groups]);
  const columns = useMemo(() => visibleColumns(p.columns, "analitico"), [p.columns]);
  const ids = useMemo(() => allIds(groups), [groups]);
  const editable = columns.some((column) => column.edit !== undefined);
  const grid = useCellGrid(editable);

  // Uncontrolled: the ids whose state differs from `defaultExpanded`.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
  const defaults = p.defaultExpanded ?? true;
  const defaultOpen = (id: string) => (Array.isArray(defaults) ? defaults.includes(id) : defaults);
  const controlled = p.expanded !== undefined;
  const expandedSet = useMemo(() => (p.expanded ? new Set(p.expanded) : null), [p.expanded]);
  const isOpen = (id: string) => (expandedSet ? expandedSet.has(id) : defaultOpen(id) !== toggled.has(id));

  const requested = useRef(new Set<string>());
  const headers = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);

  function commit(next: string[]) {
    if (!controlled) {
      const nextSet = new Set(next);
      setToggled(new Set(ids.filter((id) => defaultOpen(id) !== nextSet.has(id))));
    }
    p.onExpandedChange?.(next);
  }

  function expand(id: string) {
    requested.current.add(id);
    p.onGroupExpand?.(id);
  }

  function toggle(id: string) {
    const opening = !isOpen(id);
    commit(opening ? ids.filter((other) => other === id || isOpen(other)) : ids.filter((other) => other !== id && isOpen(other)));
    if (opening) expand(id);
  }

  const allOpen = ids.length > 0 && ids.every(isOpen);
  function toggleAll() {
    if (allOpen) {
      commit([]);
      return;
    }
    const closed = ids.filter((id) => !isOpen(id));
    commit(ids);
    closed.forEach(expand);
  }

  // Lazy rows: ask once for every group that is open without rows (e.g. open from the start).
  const openKey = ids.filter(isOpen).join("\u0000");
  useEffect(() => {
    if (!p.onGroupExpand || openKey === "") return;
    for (const id of openKey.split("\u0000")) {
      if (requested.current.has(id)) continue;
      const group = findGroup(groups, id);
      if (!group || group.loading || group.rows !== undefined || hasChildren(group)) continue;
      requested.current.add(id);
      p.onGroupExpand(id);
    }
  }, [openKey, groups, p]);

  // "Ir a": once the group is open, scroll its card into view and focus its header.
  useEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    pendingFocus.current = null;
    document
      .getElementById(groupAnchorId(id))
      ?.scrollIntoView?.({ block: "start", behavior: prefersReducedMotion() ? "instant" : "smooth" });
    headers.current.get(id)?.focus({ preventScroll: true });
  }, [focusTick]);

  function goTo(event: MouseEvent<HTMLElement>, id: string) {
    event.preventDefault();
    if (!isOpen(id)) toggle(id);
    pendingFocus.current = id;
    setFocusTick((n) => n + 1);
  }

  if (p.loading) return <LoadingSkeleton variant="table" />;
  if (p.error) return <ErrorState title={p.error.title} onRetry={p.error.onRetry} />;
  if (groups.length === 0) return <EmptyState {...(p.emptyState ?? { title: GROUPED_TABLE_EMPTY_TITLE })} />;

  const topIds = new Set(groups.map((group) => group.id));
  const anchors = (p.anchors ?? []).filter((anchor) => topIds.has(anchor.groupId));
  const ctx: Ctx<Row> = { props: p, columns, grid: editable ? grid : null, isOpen, toggle };
  const setHeaderRef = (id: string, el: HTMLButtonElement | null) => {
    if (el) headers.current.set(id, el);
    else headers.current.delete(id);
  };

  const body = (
    <div data-slot="grouped-table" className="flex min-w-0 flex-col gap-3" {...(editable ? grid.rootProps : {})}>
      {anchors.length > 0 || p.toggleAll !== false ? (
      <div className="flex flex-wrap items-center gap-2">
        {anchors.length > 0 ? (
          <nav aria-label={ANCHORS_LABEL} className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
              {ANCHORS_LABEL}
            </span>
            {anchors.map((anchor) => (
              <a
                key={anchor.groupId}
                href={`#${groupAnchorId(anchor.groupId)}`}
                onClick={(event: MouseEvent<HTMLElement>) => goTo(event, anchor.groupId)}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-[30px] gap-2 rounded-[10px] px-3 text-[12.5px] font-medium",
                )}
              >
                {anchor.label}
                <span
                  className={cn(
                    "font-mono",
                    anchor.tone === "destructive" && anchor.count > 0 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {anchor.count}
                </span>
              </a>
            ))}
            {p.anchorsCaption ? <span className="text-xs text-muted-foreground">{p.anchorsCaption}</span> : null}
          </nav>
        ) : null}
        <span className="flex-1" />
        {p.toggleAll !== false ? (
          <Button type="button" variant="link" size="sm" onClick={toggleAll}>
            {allOpen ? COLLAPSE_ALL_LABEL : EXPAND_ALL_LABEL}
          </Button>
        ) : null}
      </div>
      ) : null}
      {p.layout === "table" ? (
        <section aria-label={p.label} data-slot="group-card" className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table
              role={editable ? "grid" : undefined}
              className="w-full border-collapse text-[12.5px]"
              style={{ minWidth: columns.reduce((sum, column) => sum + (column.width ?? DEFAULT_COLUMN_WIDTH), 0) }}
            >
              <caption className="sr-only">{p.label}</caption>
              <thead className="sticky top-0 z-10">
                <HeaderRow ctx={ctx} />
              </thead>
              {groups.map((group) => (
                <ChildGroup key={group.id} ctx={ctx} group={group} anchorId={groupAnchorId(group.id)} setHeaderRef={setHeaderRef} />
              ))}
              {p.footerRow ? (
                <tfoot>
                  <FooterCells ctx={ctx} totals={p.footerRow} slot="table-footer" />
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>
      ) : (
        groups.map((group) => <TopGroup key={group.id} ctx={ctx} group={group} setHeaderRef={setHeaderRef} />)
      )}
      {p.totals ? (
        <div
          data-slot="grouped-table-totals"
          className="flex flex-wrap justify-between gap-2 rounded-lg border bg-muted px-4 py-3 text-[12.5px] font-semibold text-foreground"
        >
          <span>{p.totals.label}</span>
          <span className="font-mono">{p.totals.summary}</span>
        </div>
      ) : null}
    </div>
  );
  return editable ? <CellGridContext.Provider value={grid.api}>{body}</CellGridContext.Provider> : body;
}
