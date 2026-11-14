"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import type { PageHeaderProps } from "@/components/shell/PageHeader";
import { ListPage, type ListSpec } from "@/components/patterns/ListPage";
import { OPEN_TASK_LABEL } from "@/components/widgets/editable-cell";
import { PeopleStack, ResponsableAvatar } from "@/components/widgets/PeopleStack";
import { EtapaBadge } from "@/components/widgets/EtapaBadge";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import { tareasListInfiniteOptions } from "@/lib/query/options/tareas";
import type { TareasListFilters } from "@/lib/query/keys";
import { tareasHref } from "@/lib/tareas/query";
import { TASK_TABLE_SORT_KEYS, nextSort, tableSortOf } from "@/lib/tareas/sort";
import { listItemOfRow } from "@/lib/tareas/page-data";
import type { TareasQuery } from "@/lib/tareas/query";
import type { TaskListItem, TaskListRow, WorkflowRef } from "@/lib/types/core";
import { SubtaskProgressChip } from "@/components/widgets/analitico-task-cell";
import { NESTED_ROW_PARENT } from "@/components/widgets/record-table-format";

import { LISTA_COLUMNS, listaTable, listaTasks, withSubtaskRows } from "./lista-table";
import { AddSubtaskInline, useCanCreateSubtask } from "./AddSubtaskInline";
import { AddSubtaskButton, SubtaskToggle, subtaskOfLabel, useSubtaskRows } from "./use-subtask-rows";
import { TASK_SUPPORT_COLUMN } from "./task-cell-edits";
import { SUPPORT_COLUMN_LABEL } from "./task-table-copy";
import { TareasStartSlot, startSlotEtapa } from "./TareasStartSlot";
import { TAREAS_CELL_KEYS, useTaskCellEdits } from "./use-task-cell-edits";
import { deleteTargetOf, useDeleteTasks } from "./use-delete-tasks";
import { TaskBulkBar } from "./TaskBulkBar";
import { useTaskSelection } from "./use-task-selection";
import { replaceTareasUrl, useTareasFilters, useTareasPage, useTareasPageReady, useTareasSort } from "./use-tareas-page";

/** Empty state when the filters leave no task (FE §3.4). */
export const LISTA_EMPTY: EmptyStateProps = { title: "No hay tareas con estos filtros" };

export type TareasListaProps = {
  /** The `/tareas` query: its filters key the list (`qk.tareas.list(f)`); one etapa mounts the start slot. */
  query: TareasQuery;
  header: PageHeaderProps;
  filters?: ReactNode;
  tabs?: ReactNode;
  empty?: EmptyStateProps;
};

const NO_ETAPAS: WorkflowRef[] = [];
const NO_STAFF: { id: string; name: string }[] = [];
const sameRow = (row: TaskListRow) => row;
/** Every Lista column with a server sort (#1044). */
const LISTA_SORTABLE = LISTA_COLUMNS.map((c) => c.key).filter((key) => key in TASK_TABLE_SORT_KEYS);

/**
 * Tareas · Lista (FE §3.4, §4.10.2): `ListPage` with
 * `spec.kind = "table"`, from `useInfiniteQuery(tareas.list(f))` (first page
 * seeded by the page bundle; "Cargar más" loads the next one). `RecordTable`
 * renders the three styles from the one table (Visual grouped by estatus with
 * Completado collapsed, Esencial plain rows with the Plazo column, Analítico
 * dense rows sorted by delay with the by-project summary columns), so this
 * view never branches on the style. With a single etapa, Project Flow's
 * start slot (its own query, `qk.tareas.startSlot`) sits above the table.
 */
export function TareasLista({ query, header, filters, tabs, empty = LISTA_EMPTY }: TareasListaProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const f = useTareasFilters(query);
  // ── Header sort (#1044): `?orden=` sorts on the server; the rows then keep that
  // order, so an open parent's subtasks stay right under it.
  const sort = useTareasSort(query);
  const listFilters = useMemo<TareasListFilters>(
    () =>
      sort ? { ...f, orderBy: sort.orderBy, ...(sort.orderDir === "desc" ? { orderDir: "desc" as const } : {}) } : f,
    [f, sort],
  );
  const tableSort = useMemo(
    () => ({
      sortable: LISTA_SORTABLE,
      sort: tableSortOf(sort),
      onSortChange: (key: string) => {
        const column = TASK_TABLE_SORT_KEYS[key];
        if (column) replaceTareasUrl(tareasHref({ ...query, orden: nextSort(sort, column) }));
      },
    }),
    [sort, query],
  );
  const ready = useTareasPageReady(query);
  const page = useTareasPage(query).data;
  const etapas = page?.etapas ?? NO_ETAPAS;
  const staff = page?.staff ?? NO_STAFF;
  const list = useInfiniteQuery({ ...tareasListInfiniteOptions(listFilters), enabled: ready });

  const pages = list.data?.pages;
  // Delete (#1041): deleted rows (and their subtasks) leave right away.
  const deletes = useDeleteTasks();
  const isHidden = deletes.isHidden;
  const loaded = useMemo(
    () => (pages ?? []).flatMap((p) => p.rows.filter((r) => !isHidden(r.id, r.parentTaskId)).map(listItemOfRow)),
    [pages, isHidden],
  );
  // Idempotent: the rows come narrowed by etapa and proyecto already.
  const tasks = useMemo(
    () => listaTasks(loaded, { etapa: query.etapa, proyecto: query.proyecto }),
    [loaded, query.etapa, query.proyecto],
  );
  // ── Subtasks (#1048): an open parent's subtasks follow it, in its estatus group.
  const rowsById = useMemo(() => new Map((pages ?? []).flatMap((p) => p.rows).map((r) => [r.id, r])), [pages]);
  const parents = useMemo(
    () => tasks.map((t) => rowsById.get(t.id)).filter((r): r is TaskListRow => r !== undefined),
    [tasks, rowsById],
  );
  const canCreate = useCanCreateSubtask();
  const subtasks = useSubtaskRows<TaskListRow>({ parents, toRow: sameRow, taskOf: sameRow, isHidden, canAdd: canCreate });
  const { rowDetail } = subtasks;
  const childrenOf = useCallback(
    (parentId: string): TaskListItem[] | undefined => {
      const parent = rowsById.get(parentId);
      if (!parent || !(rowDetail.hasDetail?.(parent) ?? false) || !rowDetail.isOpen(parent)) return undefined;
      return rowDetail.rows?.(parent)?.map(listItemOfRow);
    },
    [rowsById, rowDetail],
  );
  const tasksById = useMemo(
    () => new Map([...tasks, ...subtasks.shownRows.map(listItemOfRow)].map((t) => [t.id, t])),
    [tasks, subtasks.shownRows],
  );

  // ── Editable cells (#1025): the task columns; Proyecto and the calculated ones stay as they are.
  const taskOf = useCallback(
    (row: Record<string, unknown>): TaskListItem | undefined => tasksById.get(String(row.id)),
    [tasksById],
  );
  const cells = useTaskCellEdits<Record<string, unknown>>({ taskOf, etapas, staff });
  const data = useMemo(() => {
    const table = listaTable(tasks, undefined, { serverOrder: sort !== null });
    return { ...table, rows: withSubtaskRows(table.rows, childrenOf), columns: cells.withEdits(table.columns) };
  }, [tasks, cells, childrenOf, sort]);

  // ── Row checkboxes and the bulk bar (#1040): a filter change clears the selection.
  const visibleIds = useMemo(() => data.rows.map((row) => String(row.id)), [data.rows]);
  const selection = useTaskSelection({ visibleIds, resetKey: JSON.stringify(f) });
  const taskOfId = useCallback((id: string) => tasksById.get(id), [tasksById]);

  // `/tareas?…&tarea=<id>`: the task sheet opens over the mounted list.
  const taskHref = useCallback(
    (taskId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tarea", taskId);
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParams],
  );

  const renderCell = useCallback(
    (columnKey: string, row: Record<string, unknown>): ReactNode | undefined => {
      const task = tasksById.get(String(row.id));
      if (!task) return undefined;
      if (columnKey === "tarea") {
        const href = taskHref(task.id);
        // Shallow: the sheet opens from `?tarea=` and the list under it stays as it is.
        const onNavigate = (e: { preventDefault(): void }) => {
          e.preventDefault();
          window.history.pushState(null, "", href);
        };
        // In the grid a plain click on the title edits it; ⌘/Ctrl-click and the open icon open the task.
        const parentId = row[NESTED_ROW_PARENT] ? String(row[NESTED_ROW_PARENT]) : null;
        const parent = rowsById.get(parentId ?? task.id);
        const toggle =
          !parentId && parent && (rowDetail.hasDetail?.(parent) ?? false) ? (
            <SubtaskToggle open={rowDetail.isOpen(parent)} label={rowDetail.label(parent)} onToggle={() => rowDetail.onToggle(parent)} />
          ) : null;
        return (
          <>
            {toggle}
            {parentId ? <span aria-hidden="true" className="inline-block w-6" /> : null}
            <Link href={href} scroll={false} onNavigate={onNavigate} className="underline-offset-4 hover:underline">
              {task.title}
            </Link>
            {parentId && parent ? <span className="sr-only">{`, ${subtaskOfLabel(parent.title)}`}</span> : null}
            {!parentId && parent && subtasks.canAddTo(parent) && !subtasks.isAdding(parent) ? (
              <AddSubtaskButton title={parent.title} onAdd={() => subtasks.addSubtask(parent)} />
            ) : null}
            {!parentId && parent && subtasks.canAddTo(parent) && subtasks.isAdding(parent) ? (
              // The grid and the title link must not see the keys and clicks of the field.
              <span
                className="mt-1 block max-w-[420px]"
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <AddSubtaskInline parentId={parent.id} projectId={parent.projectId} autoFocus />
              </span>
            ) : null}
            {!parentId && parent ? (
              <span className="ml-1.5 inline-flex align-middle">
                <SubtaskProgressChip task={parent} />
              </span>
            ) : null}
            <Link
              href={href}
              scroll={false}
              onNavigate={onNavigate}
              tabIndex={-1}
              data-cell-open=""
              aria-label={OPEN_TASK_LABEL}
              title={OPEN_TASK_LABEL}
              className="absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100 hover:bg-muted hover:text-foreground"
            >
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </Link>
          </>
        );
      }
      if (columnKey === "etapa" && task.workflow) return <EtapaBadge etapa={task.workflow} />;
      if (columnKey === "responsable") return <ResponsableAvatar person={task.manager} />;
      if (columnKey === TASK_SUPPORT_COLUMN) return <PeopleStack people={task.support} label={SUPPORT_COLUMN_LABEL} />;
      return undefined;
    },
    [tasksById, taskHref, rowsById, rowDetail, subtasks],
  );

  const { rowActions: deleteActions, request: requestDelete, canDelete } = deletes;
  const { withAddAction } = subtasks;
  const rowMenu = useMemo(() => {
    const targetOf = (row: Record<string, unknown>) => {
      const task = tasksById.get(String(row.id));
      return task ? deleteTargetOf(task) : null;
    };
    return {
      getRowLabel: (row: Record<string, unknown>) => tasksById.get(String(row.id))?.title ?? String(row.id),
      rowActions: (row: Record<string, unknown>) => {
        const target = targetOf(row);
        if (!target) return [];
        const actions = deleteActions(target, () => window.history.pushState(null, "", taskHref(target.id)));
        const parent = rowsById.get(target.id);
        return parent ? withAddAction(parent, actions) : actions;
      },
      onRowDelete: canDelete
        ? (row: Record<string, unknown>) => {
            const target = targetOf(row);
            if (target) requestDelete([target]);
          }
        : undefined,
    };
  }, [tasksById, rowsById, withAddAction, deleteActions, requestDelete, canDelete, taskHref]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const onEndReached = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  // "Cargar más (n restantes)" (#1051): the total comes with every page, the loaded rows are counted here.
  const loadedCount = useMemo(() => (pages ?? []).reduce((sum, p) => sum + p.rows.length, 0), [pages]);
  const remaining = Math.max(0, (pages?.at(-1)?.total ?? 0) - loadedCount);
  // Only the selection's ids and setter key the spec, not the whole selection object (#1051).
  const { selectedIds, onSelectionChange } = selection;
  const spec: ListSpec = useMemo(
    () => ({
      kind: "table" as const,
      data,
      renderCell,
      rowMenu,
      rowSelection: { selectable: true, selectedIds, onSelectionChange, getRowLabel: rowMenu.getRowLabel },
      pagination: { onEndReached, hasMore: hasNextPage, loadingMore: isFetchingNextPage, remaining },
      sort: tableSort,
    }),
    [data, renderCell, rowMenu, selectedIds, onSelectionChange, onEndReached, hasNextPage, isFetchingNextPage, remaining, tableSort],
  );

  const slotEtapa = startSlotEtapa(query.etapa, etapas);
  const slot = slotEtapa ? <TareasStartSlot key={slotEtapa.id} workflow={slotEtapa} /> : null;

  return (
    <CellCommitProvider queryKeys={TAREAS_CELL_KEYS}>
      <div className="contents" {...cells.primeProps}>
        <ListPage
          header={header}
          filters={
            slot ? (
              <>
                {filters}
                {slot}
              </>
            ) : (
              filters
            )
          }
          tabs={tabs}
          spec={spec}
          empty={empty}
        />
        {deletes.dialog}
        <TaskBulkBar selection={selection} taskOf={taskOfId} staff={staff} deletes={deletes} />
      </div>
    </CellCommitProvider>
  );
}
