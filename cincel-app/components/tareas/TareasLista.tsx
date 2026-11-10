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
import { TramoBadge } from "@/components/widgets/TramoBadge";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import { tareasListInfiniteOptions } from "@/lib/query/options/tareas";
import { listItemOfRow } from "@/lib/tareas/page-data";
import type { TareasQuery } from "@/lib/tareas/query";
import type { TaskListItem, WorkflowRef } from "@/lib/types/core";

import { listaTable, listaTasks } from "./lista-table";
import { TareasStartSlot, startSlotTramo } from "./TareasStartSlot";
import { TAREAS_CELL_KEYS, useTaskCellEdits } from "./use-task-cell-edits";
import { useTareasFilters, useTareasPage, useTareasPageReady } from "./use-tareas-page";

/** Empty state when the filters leave no task (FE §3.4). */
export const LISTA_EMPTY: EmptyStateProps = { title: "No hay tareas con estos filtros" };

export type TareasListaProps = {
  /** The `/tareas` query: its filters key the list (`qk.tareas.list(f)`); one tramo mounts the start slot. */
  query: TareasQuery;
  header: PageHeaderProps;
  filters?: ReactNode;
  tabs?: ReactNode;
  empty?: EmptyStateProps;
};

const NO_TRAMOS: WorkflowRef[] = [];
const NO_STAFF: { id: string; name: string }[] = [];

/**
 * Tareas · Lista (FE §3.4, §4.10.2): `ListPage` with
 * `spec.kind = "table"`, from `useInfiniteQuery(tareas.list(f))` (first page
 * seeded by the page bundle; "Cargar más" loads the next one). `RecordTable`
 * renders the three styles from the one table (Visual grouped by estatus with
 * Completado collapsed, Esencial plain rows with the Plazo column, Analítico
 * dense rows sorted by delay with the by-project summary columns), so this
 * view never branches on the style. With a single tramo, Project Flow's
 * start slot (its own query, `qk.tareas.startSlot`) sits above the table.
 */
export function TareasLista({ query, header, filters, tabs, empty = LISTA_EMPTY }: TareasListaProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const f = useTareasFilters(query);
  const ready = useTareasPageReady(query);
  const page = useTareasPage(query).data;
  const tramos = page?.tramos ?? NO_TRAMOS;
  const staff = page?.staff ?? NO_STAFF;
  const list = useInfiniteQuery({ ...tareasListInfiniteOptions(f), enabled: ready });

  const pages = list.data?.pages;
  const loaded = useMemo(() => (pages ?? []).flatMap((p) => p.rows.map(listItemOfRow)), [pages]);
  // Idempotent: the rows come narrowed by tramo and proyecto already.
  const tasks = useMemo(
    () => listaTasks(loaded, { tramo: query.tramo, proyecto: query.proyecto }),
    [loaded, query.tramo, query.proyecto],
  );
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // ── Editable cells (#1025): the task columns; Proyecto and the calculated ones stay as they are.
  const taskOf = useCallback(
    (row: Record<string, unknown>): TaskListItem | undefined => tasksById.get(String(row.id)),
    [tasksById],
  );
  const cells = useTaskCellEdits<Record<string, unknown>>({ taskOf, tramos, staff });
  const data = useMemo(() => {
    const table = listaTable(tasks);
    return { ...table, columns: cells.withEdits(table.columns) };
  }, [tasks, cells]);

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
        return (
          <>
            <Link href={href} scroll={false} onNavigate={onNavigate} className="underline-offset-4 hover:underline">
              {task.title}
            </Link>
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
      if (columnKey === "tramo" && task.workflow) return <TramoBadge tramo={task.workflow} />;
      return undefined;
    },
    [tasksById, taskHref],
  );

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const onEndReached = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const spec: ListSpec = useMemo(
    () => ({
      kind: "table" as const,
      data,
      renderCell,
      pagination: { onEndReached, hasMore: hasNextPage, loadingMore: isFetchingNextPage },
    }),
    [data, renderCell, onEndReached, hasNextPage, isFetchingNextPage],
  );

  const slotTramo = startSlotTramo(query.tramo, tramos);
  const slot = slotTramo ? <TareasStartSlot key={slotTramo.id} workflow={slotTramo} /> : null;

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
      </div>
    </CellCommitProvider>
  );
}
