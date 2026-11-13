/**
 * The record table of the Tareas · Lista view (redesign FE §3.4, §4.10.2):
 * one row per task, grouped by estatus (Pendiente, En proceso, Completado,
 * Bloqueado), sorted by delay. The by-project summary (Abiertas, Vencidas,
 * % vencidas with heat, Retraso promedio) and the Días de retraso column are
 * `hideOn` Visual / Esencial; the Plazo column (Vencida / Esta semana / Más
 * adelante) is Esencial only. The same data feeds the three styles; the
 * widget decides what each style shows. Pure and client-safe.
 */
import { BASE_STATUSES, BASE_STATUS_LABEL, isTaskClosed } from "@/lib/tasks/status-options";
import { pctVencidas, retrasoPromedio, type TareasSummaryCounts } from "@/lib/tareas/summary";
import type { TaskListItem } from "@/lib/types/core";
import type { RecordColumn, RecordTableData } from "@/lib/types/widgets";
import { NESTED_ROW_PARENT } from "@/components/widgets/record-table-format";

import { PRIORITY_LABEL, daysLate, localIsoDate, taskDueDate } from "./tablero-table";
import { TASK_SUPPORT_COLUMN } from "./task-cell-edits";
import { SUPPORT_COLUMN_LABEL } from "./task-table-copy";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Heat thresholds of "% vencidas" (FE §15.2: > 45 % warning tint, > 60 % destructive tint). */
export const OVERDUE_SHARE_HEAT = { key: "pctVencidas", warnAt: 45, critAt: 60 } as const;

/** Heat thresholds of "Días de retraso" (frames: 3–4 plain, 6–9 warning tint, 12 destructive tint). */
export const DAYS_LATE_HEAT = { key: "diasRetraso", warnAt: 4, critAt: 10 } as const;

/** Heat thresholds of "Desv. vs plan" (`Proyectos-Analitico` legend: ≤ −5 warning tint, ≤ −8 destructive tint). */
export const PLAN_DEVIATION_HEAT = { key: "desvPlan", warnAt: -4, critAt: -7, direction: "below" } as const;

/** Esencial grouping labels (FE §3.4 "Vencidas / Esta semana / Más adelante"). */
export type ListaPlazo = "Vencida" | "Esta semana" | "Más adelante" | "Completada";

const VISUAL_AND_ESENCIAL: RecordColumn["hideOn"] = ["visual", "esencial"];

export const LISTA_COLUMNS: RecordColumn[] = [
  { key: "tarea", label: "Tarea" },
  { key: "proyecto", label: "Proyecto" },
  { key: "tramo", label: "Etapa" },
  { key: "fase", label: "Fase", hideOn: VISUAL_AND_ESENCIAL },
  { key: "responsable", label: "Responsable" },
  { key: TASK_SUPPORT_COLUMN, label: SUPPORT_COLUMN_LABEL, hideOn: ["esencial"] },
  { key: "plazo", label: "Plazo", hideOn: ["visual", "analitico"] },
  { key: "vence", label: "Vence", format: "date", mono: true },
  { key: "prioridad", label: "Prioridad", hideOn: ["esencial"] },
  { key: "subtareas", label: "Subtareas", align: "right", mono: true, hideOn: ["esencial"] },
  { key: "diasRetraso", label: "Días de retraso", format: "days", align: "right", mono: true, hideOn: VISUAL_AND_ESENCIAL },
  { key: "abiertas", label: "Abiertas del proyecto", format: "count", align: "right", mono: true, hideOn: VISUAL_AND_ESENCIAL },
  { key: "vencidas", label: "Vencidas del proyecto", format: "count", align: "right", mono: true, hideOn: VISUAL_AND_ESENCIAL },
  { key: "pctVencidas", label: "% vencidas", format: "percent", align: "right", mono: true, hideOn: VISUAL_AND_ESENCIAL },
  { key: "retrasoPromedio", label: "Retraso promedio", format: "days", align: "right", mono: true, hideOn: VISUAL_AND_ESENCIAL },
];

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Days from `today` to the Sunday that closes its week (0 on Sunday). */
function daysToEndOfWeek(today: string): number {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return weekday === 0 ? 0 : 7 - weekday;
}

/** Esencial group of a task: closed → Completada; overdue → Vencida; due by Sunday → Esta semana; else Más adelante. */
export function listaPlazo(task: TaskListItem, today: string): ListaPlazo {
  if (isTaskClosed(task)) return "Completada";
  if (daysLate(task, today) > 0) return "Vencida";
  const due = taskDueDate(task);
  if (due && dayNumber(due) - dayNumber(today) <= daysToEndOfWeek(today)) return "Esta semana";
  return "Más adelante";
}

export type ProjectSummary = {
  /** Open (not closed) tasks of the project in the list. */
  abiertas: number;
  /** Open tasks past their due date. */
  vencidas: number;
  /** vencidas / abiertas, 0–100, rounded. */
  pctVencidas: number;
  /** Average days late of the overdue tasks; 0 when none. */
  retrasoPromedio: number;
};

/** The summary counts (`TareasSummaryCounts`) of some tasks, as `taskSummary` counts them on the server. */
export function summaryCountsOf(tasks: TaskListItem[], today: string): TareasSummaryCounts {
  const open = tasks.filter((t) => !isTaskClosed(t));
  const late = open.map((t) => daysLate(t, today)).filter((d) => d > 0);
  return {
    total: tasks.length,
    open: open.length,
    overdue: late.length,
    blocked: tasks.filter((t) => t.status === "bloqueado").length,
    daysLateSum: late.reduce((acc, d) => acc + d, 0),
  };
}

/** A `ProjectSummary` from summary counts, through the shared helpers (`pctVencidas`, `retrasoPromedio`). */
export function projectSummaryOf(counts: TareasSummaryCounts): ProjectSummary {
  return {
    abiertas: counts.open,
    vencidas: counts.overdue,
    pctVencidas: pctVencidas(counts),
    retrasoPromedio: retrasoPromedio(counts) ?? 0,
  };
}

function summarize(tasks: TaskListItem[], today: string): ProjectSummary {
  return projectSummaryOf(summaryCountsOf(tasks, today));
}

/** The by-project summary (Analítico), keyed by project id. */
export function projectSummaries(tasks: TaskListItem[], today: string): Map<string, ProjectSummary> {
  const byProject = new Map<string, TaskListItem[]>();
  for (const task of tasks) {
    const list = byProject.get(task.project.id) ?? [];
    list.push(task);
    byProject.set(task.project.id, list);
  }
  return new Map([...byProject].map(([id, list]) => [id, summarize(list, today)]));
}

const STATUS_ORDER = new Map(BASE_STATUSES.map((s, i) => [s, i]));

/** Estatus order first (groups), then most days late, then nearest due date, then title. */
export function sortListaTasks(tasks: TaskListItem[], today: string): TaskListItem[] {
  return [...tasks].sort((a, b) => {
    const byStatus = (STATUS_ORDER.get(a.status) ?? 99) - (STATUS_ORDER.get(b.status) ?? 99);
    if (byStatus !== 0) return byStatus;
    const byDelay = daysLate(b, today) - daysLate(a, today);
    if (byDelay !== 0) return byDelay;
    const dueA = taskDueDate(a);
    const dueB = taskDueDate(b);
    if (dueA !== dueB) {
      if (!dueA) return 1;
      if (!dueB) return -1;
      return dueA < dueB ? -1 : 1;
    }
    return a.title.localeCompare(b.title, "es");
  });
}

export function listaRow(task: TaskListItem, today: string, summary: ProjectSummary): Record<string, unknown> {
  return {
    id: task.id,
    // Group label: the base status, so a custom status falls in its base group.
    estatus: BASE_STATUS_LABEL[task.status],
    tarea: task.title,
    proyecto: task.project.name,
    tramo: task.workflow?.name ?? null,
    fase: task.phase?.name ?? null,
    responsable: task.manager?.name ?? null,
    // The cell renders the avatars (`PeopleStack`); the names are its text value.
    [TASK_SUPPORT_COLUMN]: task.support.length > 0 ? task.support.map((s) => s.name).join(", ") : null,
    plazo: listaPlazo(task, today),
    vence: taskDueDate(task),
    prioridad: PRIORITY_LABEL[task.priority],
    subtareas: task.subtaskCount > 0 ? `${task.subtaskDoneCount}/${task.subtaskCount}` : null,
    diasRetraso: daysLate(task, today),
    abiertas: summary.abiertas,
    vencidas: summary.vencidas,
    pctVencidas: summary.pctVencidas,
    retrasoPromedio: summary.retrasoPromedio,
  };
}

/**
 * The Lista `RecordTableData`: grouped by estatus, sorted by delay, with the
 * by-project summary columns and a totals row over the whole list.
 */
export function listaTable(
  tasks: TaskListItem[],
  today: string = localIsoDate(),
  opts: { serverOrder?: boolean } = {},
): RecordTableData {
  const summaries = projectSummaries(tasks, today);
  // With a header sort (#1044) the server already ordered the rows.
  const sorted = opts.serverOrder ? tasks : sortListaTasks(tasks, today);
  const rows = sorted.map((t) => listaRow(t, today, summaries.get(t.project.id) ?? summarize([t], today)));
  const overall = summarize(tasks, today);
  return {
    columns: LISTA_COLUMNS,
    rows,
    groupBy: "estatus",
    totals: {
      tarea: tasks.length === 1 ? "Total · 1 tarea" : `Total · ${tasks.length} tareas`,
      diasRetraso: rows.reduce((acc, r) => acc + (r.diasRetraso as number), 0),
      abiertas: overall.abiertas,
      vencidas: overall.vencidas,
      pctVencidas: overall.pctVencidas,
      retrasoPromedio: overall.retrasoPromedio,
    },
    heat: [{ ...OVERDUE_SHARE_HEAT }],
  };
}

/**
 * The Lista rows with each open parent's subtasks right after it (#1048):
 * a subtask row keeps its parent's estatus group (it stays under the
 * parent), carries `NESTED_ROW_PARENT` (drawn lighter) and leaves the
 * by-project summary cells empty. The totals stay the parents'.
 */
export function withSubtaskRows(
  rows: Record<string, unknown>[],
  childrenOf: (parentId: string) => TaskListItem[] | undefined,
  today: string = localIsoDate(),
): Record<string, unknown>[] {
  const blank = { abiertas: null, vencidas: null, pctVencidas: null, retrasoPromedio: null };
  return rows.flatMap((row) => {
    const children = childrenOf(String(row.id));
    if (!children || children.length === 0) return [row];
    const nested = children.map((child) => ({
      ...listaRow(child, today, projectSummaryOf(summaryCountsOf([child], today))),
      ...blank,
      estatus: row.estatus,
      [NESTED_ROW_PARENT]: row.id,
    }));
    return [row, ...nested];
  });
}

/**
 * The tasks the Lista view shows: the page loads them without the tramo and
 * proyecto filters (they feed the chip counts and the Proyecto options), so
 * the view narrows them here. `tramo` is a key or a comma list of keys.
 */
export function listaTasks(tasks: TaskListItem[], filters: { tramo: string | null; proyecto: string | null }): TaskListItem[] {
  const keys = filters.tramo
    ? new Set(
        filters.tramo
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
      )
    : null;
  return tasks.filter(
    (t) =>
      (!keys || (t.workflow !== null && keys.has(t.workflow.key))) &&
      (!filters.proyecto || t.project.id === filters.proyecto),
  );
}
