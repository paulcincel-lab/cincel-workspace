"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import type { PageHeaderProps } from "@/components/shell/PageHeader";
import { ListPage, type ListSpec } from "@/components/patterns/ListPage";
import { setTaskCustomStatusAction, setTaskStatusAction } from "@/lib/actions/tasks-actions";
import { useActionMutation } from "@/lib/query/mutation";
import { qk, type TareasListFilters } from "@/lib/query/keys";
import {
  tableroMoveInvalidations,
  tareasBoardOptions,
  type TareasBoardColumnPages,
} from "@/lib/query/options/tareas";
import {
  boardOfColumns,
  columnKeyOfRow,
  moveBoardCard,
  movedRow,
  type TareasBoardData,
} from "@/lib/tareas/page-data";
import type { TareasQuery } from "@/lib/tareas/query";
import { parseStatusValue } from "@/lib/tasks/status-options";
import type { TaskDetail, TaskListRow } from "@/lib/types/core";
import type { ActionResult } from "@/lib/types/schedule";

import { tableroTable } from "./tablero-table";
import { useTareasFilters, useTareasPageReady } from "./use-tareas-page";

/** Header description of the Tablero view (FE §3.4). */
export const TABLERO_DESCRIPTION = "Todas los tramos en un solo lugar. Arrastra una tarjeta para cambiar su estatus.";

/**
 * Empty state when the filters leave no task (FE §3.4). Visual keeps every
 * column (count 0, "Sin tareas" drop zone) and never shows it; Esencial and
 * Analítico, which have no columns, show it instead of the board.
 */
export const TABLERO_EMPTY: EmptyStateProps = { title: "No hay tareas con estos filtros" };

export type TareasTableroProps = {
  /** The `/tareas` query: its filters key the board (`qk.tareas.board(f)`). */
  query: TareasQuery;
  header: PageHeaderProps;
  filters?: ReactNode;
  tabs?: ReactNode;
  empty?: EmptyStateProps;
};

/** A Tablero move: the task, the column it goes to and its project (for the invalidations). */
export type TableroMoveVars = { taskId: string; columnKey: string; projectId: string | null };

/**
 * Moves a task to a board column: a base status goes through
 * `setTaskStatusAction`, a `custom:<id>` column through
 * `setTaskCustomStatusAction`. Both return an `ActionResult`.
 */
export function moveTaskToColumnAction(vars: TableroMoveVars): Promise<ActionResult<TaskDetail>> {
  const target = parseStatusValue(vars.columnKey);
  return target.kind === "custom"
    ? setTaskCustomStatusAction(vars.taskId, target.id)
    : setTaskStatusAction(vars.taskId, target.status);
}

/** The "Cargar más" pages of the board's columns that are in the cache. */
function cachedColumnPages(qc: QueryClient, f: TareasListFilters): [QueryKey, TareasBoardColumnPages][] {
  return qc
    .getQueriesData<TareasBoardColumnPages>({ queryKey: qk.tareas.board(f) })
    .filter(
      (entry): entry is [QueryKey, TareasBoardColumnPages] =>
        entry[0].length === 4 && entry[1] !== undefined && Array.isArray(entry[1].pages),
    );
}

/** A task as the board cache has it: on a column's first rows or a "Cargar más" page. */
export function findBoardRow(qc: QueryClient, f: TareasListFilters, taskId: string): TaskListRow | null {
  const board = qc.getQueryData<TareasBoardData>(qk.tareas.board(f));
  for (const column of Object.values(board?.columns ?? {})) {
    const row = column.rows.find((r) => r.id === taskId);
    if (row) return row;
  }
  for (const [, pages] of cachedColumnPages(qc, f)) {
    for (const page of pages.pages) {
      const row = page.rows.find((r) => r.id === taskId);
      if (row) return row;
    }
  }
  return null;
}

export type TableroMoveSnapshot = {
  board: TareasBoardData | undefined;
  columnPages: [QueryKey, TareasBoardColumnPages][];
  detail: { key: QueryKey; value: TaskDetail } | null;
};

/**
 * The optimistic part of a Tablero move (plan §4.4) on `tareas.board(f)`:
 * cancel the board's fetches, snapshot it, move the card between columns
 * (both totals adjusted), drop it from any "Cargar más" page and patch
 * `tasks.detail(id)` when cached. `rollback` puts the snapshot back.
 */
export function tableroMoveOptimistic(f: TareasListFilters) {
  return {
    async onMutate(qc: QueryClient, vars: TableroMoveVars): Promise<TableroMoveSnapshot> {
      const boardKey = qk.tareas.board(f);
      await qc.cancelQueries({ queryKey: boardKey });
      const board = qc.getQueryData<TareasBoardData>(boardKey);
      const columnPages = cachedColumnPages(qc, f);
      const detailKey = qk.tasks.detail(vars.taskId);
      const detail = qc.getQueryData<TaskDetail | null>(detailKey) ?? null;

      const row = findBoardRow(qc, f, vars.taskId);
      if (board) {
        qc.setQueryData<TareasBoardData>(boardKey, moveBoardCard(board, vars.taskId, vars.columnKey, row ?? undefined));
      }
      for (const [key, pages] of columnPages) {
        if (!pages.pages.some((p) => p.rows.some((r) => r.id === vars.taskId))) continue;
        qc.setQueryData<TareasBoardColumnPages>(key, {
          ...pages,
          pages: pages.pages.map((p) => ({ ...p, rows: p.rows.filter((r) => r.id !== vars.taskId) })),
        });
      }
      const moved = row ? movedRow(row, vars.columnKey, board?.statuses ?? []) : null;
      if (detail && moved) {
        qc.setQueryData<TaskDetail>(detailKey, { ...detail, status: moved.status, customStatus: moved.customStatus });
      }
      return { board, columnPages, detail: detail ? { key: detailKey, value: detail } : null };
    },
    rollback(qc: QueryClient, snap: TableroMoveSnapshot): void {
      if (snap.board) qc.setQueryData(qk.tareas.board(f), snap.board);
      for (const [key, pages] of snap.columnPages) qc.setQueryData(key, pages);
      if (snap.detail) qc.setQueryData(snap.detail.key, snap.detail.value);
    },
  };
}

/**
 * The Tablero drag as a mutation (plan §3, §4.4): optimistic on
 * `tareas.board(f)`, rolled back with the mapped error toast; a cached task
 * detail takes the server's row; then the facets, every Lista, the project's
 * tabs, Inicio and the badges are invalidated (not the board just patched).
 */
export function useTableroMove(f: TareasListFilters) {
  return useActionMutation<TableroMoveVars, TaskDetail, TableroMoveSnapshot>(moveTaskToColumnAction, {
    optimistic: tableroMoveOptimistic(f),
    setData: (qc, data) => {
      const key = qk.tasks.detail(data.id);
      if (qc.getQueryData(key) !== undefined) qc.setQueryData(key, data);
    },
    invalidate: (vars, data) => tableroMoveInvalidations(data?.projectId ?? vars.projectId),
  });
}

const NO_BOARD: TareasBoardData = { columns: {}, statuses: [] };

/**
 * Tareas · Tablero (FE §3.4): `ListPage` with
 * `spec.kind = "board"`, from `tareas.board(f)` (seeded by the page bundle
 * and enabled once it is in, so a filter change sends one request). Every
 * column of the status catalog shows, with 0 when empty (#919).
 * `TaskBoardWidget` renders the three styles from the one board, so this
 * view never branches on the style. A drop runs `useTableroMove`; "+ Agregar"
 * opens the shell's new-task dialog, whose `tareas` invalidation brings the
 * new card into its column.
 */
export function TareasTablero({ query, header, filters, tabs, empty = TABLERO_EMPTY }: TareasTableroProps) {
  const f = useTareasFilters(query);
  const ready = useTareasPageReady(query);
  const { data = NO_BOARD } = useQuery({ ...tareasBoardOptions(f), enabled: ready });
  const board = useMemo(() => boardOfColumns(data.columns), [data]);
  const table = useMemo(() => tableroTable(board), [board]);
  const columnPages = useMemo(() => ({ filters: f, columns: data.columns }), [f, data]);

  const qc = useQueryClient();
  const { mutate } = useTableroMove(f);
  const onMove = useCallback(
    (taskId: string, columnKey: string) => {
      const row = findBoardRow(qc, f, taskId);
      if (row && columnKeyOfRow(row) === columnKey) return;
      mutate({ taskId, columnKey, projectId: row?.project.id ?? null });
    },
    [qc, f, mutate],
  );

  // Built as a value (not an inline literal) so the spec stays assignable to `ListSpec`.
  const spec = useMemo(
    () => ({ kind: "board" as const, board, table, onMove, customStatuses: data.statuses, columnPages }),
    [board, table, onMove, data.statuses, columnPages],
  );
  const listSpec: ListSpec = spec;

  return (
    <ListPage
      header={{ description: TABLERO_DESCRIPTION, ...header }}
      filters={filters}
      tabs={tabs}
      spec={listSpec}
      empty={empty}
    />
  );
}
