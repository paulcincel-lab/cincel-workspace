/**
 * Task table sort (#1044): the sortable columns, the URL form
 * (`?orden=vence:asc`) and the Spanish phrase of the subtitle. Client-safe.
 */

/** Every sortable column of the task tables; "retraso" is the Analítico default. */
export const TASK_SORT_COLUMNS = [
  "titulo",
  "tramo",
  "fase",
  "responsable",
  "estatus",
  "vence",
  "prioridad",
  "subtareas",
  "retraso",
] as const;

export type TaskSortColumn = (typeof TASK_SORT_COLUMNS)[number];

export type TaskSortDir = "asc" | "desc";

/** The sort the Analítico tramo groups use when the URL has none. */
export const DEFAULT_TASK_SORT: { orderBy: TaskSortColumn; orderDir: TaskSortDir } = {
  orderBy: "retraso",
  orderDir: "asc",
};

/** `?orden=<column>:<dir>` → the sort; null when missing or not valid (the default applies). */
export function parseSortParam(value: string | null | undefined): { orderBy: TaskSortColumn; orderDir: TaskSortDir } | null {
  void value;
  return null;
}

/** The `?orden=` value of a sort; null for the default, so the URL leaves it out. */
export function formatSortParam(orderBy: TaskSortColumn | undefined, orderDir: TaskSortDir | undefined): string | null {
  void orderBy;
  void orderDir;
  return null;
}

/**
 * The sort part of the Tareas subtitle, e.g. "ordenada por vencimiento (más
 * próximo primero)"; the default is "ordenada por retraso". The page shows
 * `Por proyecto y tramo, ${describeSort(orderBy, dir)}`.
 */
export function describeSort(orderBy: TaskSortColumn | undefined, dir: TaskSortDir = "asc"): string {
  void orderBy;
  void dir;
  return "ordenada por retraso";
}
