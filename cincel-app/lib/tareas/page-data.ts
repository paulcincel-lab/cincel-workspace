/**
 * Tareas list and board data (Query Migration 4a, #955): the
 * `getTareasPageData` shapes and the pure helpers the views and the Tablero
 * drag share. Client-safe: types plus plain functions, no server imports.
 */
import {
  BASE_STATUSES,
  customStatusBase,
  customStatusValue,
  parseStatusValue,
  statusSelectValue,
} from "@/lib/tasks/status-options";
import type { TaskListItem, TaskListRow, TaskStatusOption, WorkflowRef } from "@/lib/types/core";
import type { TaskBoard } from "@/lib/types/redesign";
import type { TareasMostrar } from "@/lib/tareas/query";
import type { TareasSummary } from "@/lib/tareas/summary";
import type { TareasListFilters } from "@/lib/query/keys";
import type { TaskSortColumn, TaskSortDir } from "@/lib/tareas/sort";
import type { KpiDatum } from "@/lib/types/widgets";

/** Rows the board loads per column before "Cargar más". */
export const TAREAS_BOARD_PER_COLUMN = 20;

/**
 * Rows per "Cargar más" page of every task list (#1051): Tareas, the project
 * Tareas tab, Resumen, Mi espacio and the expanded Proyectos rows.
 */
export const TASK_LIST_PAGE_SIZE = 30;

/** Rows per Lista page: the same first page as every other task list. */
export const TAREAS_LIST_PAGE_SIZE = TASK_LIST_PAGE_SIZE;

/** Chip counts and Proyecto options (`taskFacets`): they ignore the etapa and proyecto filters. */
export type TareasFacets = {
  /** "Todas": the tasks in the selected project, any etapa. */
  total: number;
  /** Per etapa key: the tasks in the selected project. */
  byEtapa: Record<string, number>;
  /** The projects with tasks in the selected etapa, by name (the selected one always). */
  projects: {
    id: string;
    name: string;
    count: number;
    /** Open and overdue tasks of the project, for the Proyecto dropdown (#1045). */
    open?: number;
    overdue?: number;
  }[];
  /** "Mostrar" counts in the selected etapa and project; they ignore `mostrar` itself. */
  mostrar?: Record<TareasMostrar, number>;
  /** Of those tasks, the ones the viewer manages. */
  mine?: number;
};

/**
 * One page of slim rows: Lista pages and the per-column pages of the board.
 * `rows` and `total` are top-level tasks (#1047); `subtaskTotal` is the
 * subtasks of every matching parent, for an "n subtareas" count.
 */
export type TareasRowsPage = { rows: TaskListRow[]; nextCursor: string | null; total: number; subtaskTotal?: number };

/** The one input of every task list page (`getTareasListPage`), #1044/#1047/#1051. */
export type TaskListPageInput = {
  filters: TareasListFilters;
  /** The previous page's `nextCursor`; null for the first page. */
  cursor: string | null;
  /** Default `TAREAS_LIST_PAGE_SIZE`. */
  limit?: number;
  /** Default: the board order; "retraso" is the Analítico groups' default. Same as `filters.orderBy`. */
  orderBy?: TaskSortColumn;
  /** Default "asc". */
  orderDir?: TaskSortDir;
};

/** A board column: its first rows, every matching task counted, and the cursor after the last row. */
export type TareasBoardColumn = { rows: TaskListRow[]; total: number; nextCursor: string | null };

/**
 * The board (`qk.tareas.board(f)`): every column of the status catalog, keyed
 * by the status select value (`pendiente`, …, `custom:<id>`), with `total: 0`
 * and no rows when empty (#919), plus the configured custom statuses.
 */
export type TareasBoardData = {
  columns: Record<string, TareasBoardColumn>;
  statuses: TaskStatusOption[];
};

/** A staff option of the Responsable filter: `{id,name}` only, never the full `Staff`. */
export type TareasStaffOption = { id: string; name: string };

/** `getTareasPageData`: what one `/tareas` view needs, in one call. */
export type TareasPageData = {
  facets: TareasFacets;
  etapas: WorkflowRef[];
  staff: TareasStaffOption[];
  /** Lista: the first page. */
  list?: TareasRowsPage;
  /** Tablero: the first rows of every column. */
  board?: TareasBoardData;
  /** Esencial: the cards per project. */
  byProject?: TareasByProject;
  /** Analítico: the counts per project and etapa (`qk.tareas.summary(f)`). */
  summary?: TareasSummary;
  /** Analítico: the first page of the first expanded etapa groups, keyed by their list filters (`tareasGroupFilters`). */
  groups?: { filters: TareasListFilters; page: TareasRowsPage }[];
};

/** A slim row as the list item the views render (`notes` is never loaded for lists). */
export function listItemOfRow(row: TaskListRow): TaskListItem {
  return { ...row, notes: null };
}

/** The board's loaded rows as a per-base-status board (the shape `TaskBoardWidget` groups by column). */
export function boardOfColumns(columns: Record<string, TareasBoardColumn>): TaskBoard {
  const board: TaskBoard = { pendiente: [], en_proceso: [], completado: [], bloqueado: [] };
  for (const column of Object.values(columns)) {
    for (const row of column.rows) board[row.status].push(listItemOfRow(row));
  }
  return board;
}

/** The empty board: every base column with `total: 0`, then the custom ones. */
export function emptyBoardColumns(statuses: Pick<TaskStatusOption, "id">[]): Record<string, TareasBoardColumn> {
  const out: Record<string, TareasBoardColumn> = {};
  for (const s of BASE_STATUSES) out[s] = { rows: [], total: 0, nextCursor: null };
  for (const c of statuses) out[customStatusValue(c.id)] = { rows: [], total: 0, nextCursor: null };
  return out;
}

/**
 * The row as it reads once moved to `columnKey`: a base column clears the
 * custom status; a custom column sets it, with the base status underneath
 * (`underlyingStatus` on the server). Null when the custom status is unknown.
 */
export function movedRow(row: TaskListRow, columnKey: string, statuses: TaskStatusOption[]): TaskListRow | null {
  const target = parseStatusValue(columnKey);
  if (target.kind === "base") return { ...row, status: target.status, customStatus: null };
  const custom =
    statuses.find((s) => s.id === target.id) ?? (row.customStatus?.id === target.id ? row.customStatus : null);
  if (!custom) return null;
  return {
    ...row,
    status: customStatusBase(custom),
    customStatus: { id: custom.id, name: custom.name, closes: custom.closes, countsAsCompleted: custom.countsAsCompleted },
  };
}

/** The column a row sits in on the board (`statusSelectValue`). */
export function columnKeyOfRow(row: Pick<TaskListRow, "status" | "customStatus">): string {
  return statusSelectValue(row);
}

/**
 * Moves a task between columns of the board: out of the column it sits in
 * (when loaded there), on top of `columnKey`, both totals adjusted. `row` is
 * the task when it isn't on the board's first rows (a "Cargar más" page).
 * Returns the board unchanged when the task or the column is unknown.
 */
export function moveBoardCard(
  board: TareasBoardData,
  taskId: string,
  columnKey: string,
  row?: TaskListRow,
): TareasBoardData {
  let found: { key: string; row: TaskListRow } | null = null;
  for (const [key, column] of Object.entries(board.columns)) {
    const hit = column.rows.find((r) => r.id === taskId);
    if (hit) {
      found = { key, row: hit };
      break;
    }
  }
  const source = found?.row ?? row;
  if (!source) return board;
  const fromKey = found?.key ?? columnKeyOfRow(source);
  if (fromKey === columnKey) return board;
  const moved = movedRow(source, columnKey, board.statuses);
  if (!moved) return board;

  const columns = { ...board.columns };
  const from = columns[fromKey];
  if (from) {
    columns[fromKey] = {
      ...from,
      rows: from.rows.filter((r) => r.id !== taskId),
      total: Math.max(0, from.total - 1),
    };
  }
  const to = columns[columnKey] ?? { rows: [], total: 0, nextCursor: null };
  columns[columnKey] = { ...to, rows: [moved, ...to.rows.filter((r) => r.id !== taskId)], total: to.total + 1 };
  return { ...board, columns };
}

// ── Visual summary (`qk.tareas.trend(f)`) ────────────────────────────────────

/** The four KPI tiles of Tareas Visual. */
export type TareasTrendKey = "abiertas" | "vencidas" | "en_proceso" | "completadas";
export const TAREAS_TREND_KEYS: readonly TareasTrendKey[] = ["abiertas", "vencidas", "en_proceso", "completadas"];

/** One day of the "Esta semana" strip: the open tasks due that day and the etapa most of them are in. */
export type TareasTrendDay = { date: string; due: number; etapaKey: string | null };

/**
 * `qk.tareas.trend(f)`: the KPI tiles (value, `series7`, `delta {value, good,
 * label}`), the people with a task in progress and the open tasks due per day
 * of the current week (Monday to Sunday, America/Mexico_City).
 */
export type TareasTrend = {
  kpis: (KpiDatum & { key: TareasTrendKey })[];
  /** Distinct responsables of the tasks en proceso. */
  activeAssignees: number;
  week: { from: string; to: string; total: number; days: TareasTrendDay[] };
};

// ── Esencial (`qk.tareas.byProject(f)`) ──────────────────────────────────────

/** Open rows Tareas Esencial loads at most; past it the cards show a note and `truncated` is true. */
export const TAREAS_BY_PROJECT_LIMIT = 200;

/** One Esencial card: a project with the counts of the filters and its open rows. */
export type TareasProjectGroup = {
  project: { id: string; name: string };
  /** Open tasks matching the filters (with `mostrar=en_retraso`, the overdue ones). */
  open: number;
  /** Open and due before today (America/Mexico_City). */
  overdue: number;
  /** Closed tasks matching the filters; their rows load when the card expands them. */
  completed: number;
  /** Open rows, sorted by `sortListaTasks`. */
  rows: TaskListRow[];
};

/** `qk.tareas.byProject(f)`: the projects most overdue first, then the nearest due date, then by name. */
export type TareasByProject = { groups: TareasProjectGroup[]; truncated: boolean };
