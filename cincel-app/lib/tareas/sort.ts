/**
 * Task table sort (#1044): the sortable columns, the URL form
 * (`?orden=vence:asc`) and the Spanish phrase of the subtitle. Client-safe.
 */

/** Every sortable column of the task tables; "retraso" is the Analítico default. */
export const TASK_SORT_COLUMNS = [
  "titulo",
  "etapa",
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

export type TaskSort = { orderBy: TaskSortColumn; orderDir: TaskSortDir };

/** The sort the Analítico etapa groups use when the URL has none. */
export const DEFAULT_TASK_SORT: TaskSort = {
  orderBy: "retraso",
  orderDir: "asc",
};

/** The Tareas search param of the sort. */
export const TAREAS_ORDEN_PARAM = "orden";

const isColumn = (value: string): value is TaskSortColumn => (TASK_SORT_COLUMNS as readonly string[]).includes(value);

/** True for the default sort (or none): the URL leaves it out. */
export function isDefaultSort(orderBy: TaskSortColumn | undefined, orderDir: TaskSortDir | undefined): boolean {
  return (orderBy ?? DEFAULT_TASK_SORT.orderBy) === DEFAULT_TASK_SORT.orderBy && (orderDir ?? "asc") === DEFAULT_TASK_SORT.orderDir;
}

/** `?orden=<column>:<dir>` → the sort; null when missing or not valid (the default applies). */
export function parseSortParam(value: string | null | undefined): TaskSort | null {
  if (!value) return null;
  const [column, dir = "asc", ...rest] = value.split(":");
  if (rest.length > 0 || !column || !isColumn(column) || (dir !== "asc" && dir !== "desc")) return null;
  if (isDefaultSort(column, dir)) return null;
  return { orderBy: column, orderDir: dir };
}

/** The `?orden=` value of a sort; null for the default, so the URL leaves it out. */
export function formatSortParam(orderBy: TaskSortColumn | undefined, orderDir: TaskSortDir | undefined): string | null {
  if (!orderBy || isDefaultSort(orderBy, orderDir)) return null;
  return `${orderBy}:${orderDir ?? "asc"}`;
}

/**
 * A header click: a new column sorts ascending, the same column goes asc →
 * desc → the default sort (null).
 */
export function nextSort(current: TaskSort | null, column: TaskSortColumn): TaskSort | null {
  const active = current ?? DEFAULT_TASK_SORT;
  if (active.orderBy !== column) return { orderBy: column, orderDir: "asc" };
  if (active.orderDir === "asc") return { orderBy: column, orderDir: "desc" };
  return null;
}

/** What each column's two directions read as in the subtitle. */
const SORT_PHRASE: Record<TaskSortColumn, { label: string; asc: string; desc: string }> = {
  titulo: { label: "tarea", asc: "A a Z", desc: "Z a A" },
  etapa: { label: "etapa", asc: "primera a última", desc: "última a primera" },
  fase: { label: "fase", asc: "primera a última", desc: "última a primera" },
  responsable: { label: "responsable", asc: "A a Z", desc: "Z a A" },
  estatus: { label: "estatus", asc: "pendientes primero", desc: "completadas primero" },
  vence: { label: "vencimiento", asc: "más próximo primero", desc: "más lejano primero" },
  prioridad: { label: "prioridad", asc: "alta primero", desc: "baja primero" },
  subtareas: { label: "subtareas", asc: "menos primero", desc: "más primero" },
  retraso: { label: "retraso", asc: "más atrasadas primero", desc: "cerradas primero" },
};

/**
 * The sort part of the Tareas subtitle, e.g. "ordenada por vencimiento (más
 * próximo primero)"; the default is "ordenada por retraso". The page shows
 * `Por proyecto y etapa, ${describeSort(orderBy, dir)}`.
 */
export function describeSort(orderBy: TaskSortColumn | undefined, dir: TaskSortDir = "asc"): string {
  if (!orderBy || isDefaultSort(orderBy, dir)) return "ordenada por retraso";
  const phrase = SORT_PHRASE[orderBy];
  return `ordenada por ${phrase.label} (${phrase[dir]})`;
}

/** Task table column keys (`ANALITICO_COLUMNS`, …) → the sort column of their header. */
export const TASK_TABLE_SORT_KEYS: Readonly<Record<string, TaskSortColumn>> = {
  tarea: "titulo",
  etapa: "etapa",
  fase: "fase",
  responsable: "responsable",
  estatus: "estatus",
  vence: "vence",
  prioridad: "prioridad",
  subtareas: "subtareas",
  diasRetraso: "retraso",
};

/** The header sort of a table (`GroupedTable` / `DataTable` `sort`): its column key and direction. */
export function tableSortOf(sort: TaskSort | null | undefined): { key: string; direction: TaskSortDir } {
  const active = sort ?? DEFAULT_TASK_SORT;
  const key = Object.keys(TASK_TABLE_SORT_KEYS).find((k) => TASK_TABLE_SORT_KEYS[k] === active.orderBy) ?? "diasRetraso";
  return { key, direction: active.orderDir };
}
