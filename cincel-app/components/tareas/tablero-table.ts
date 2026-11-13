/**
 * The record table of the Tareas · Tablero view (redesign FE §3.4): one row
 * per board task, the 10 Analítico columns (Tarea, Proyecto, Tramo, Fase,
 * Responsable, Estatus, Prioridad, Vence, Días de retraso, Subtareas) and a
 * totals row. Esencial drops every column but tarea / proyecto / responsable /
 * vence (`hideOn`). Built from the same `TaskBoard` the Visual columns use, so
 * the three styles show the same tasks. Pure and client-safe.
 */
import { BASE_STATUSES, isTaskClosed, taskStatusLabel } from "@/lib/tasks/status-options";
import type { TaskListItem, TaskPriority } from "@/lib/types/core";
import type { TaskBoard } from "@/lib/types/redesign";
import type { RecordColumn, RecordTableData } from "@/lib/types/widgets";

export const PRIORITY_LABEL: Record<TaskPriority, string> = { alta: "Alta", media: "Media", baja: "Baja" };

const DAY_MS = 24 * 60 * 60 * 1000;

const COLUMNS: RecordColumn[] = [
  { key: "tarea", label: "Tarea" },
  { key: "proyecto", label: "Proyecto" },
  { key: "tramo", label: "Etapa", hideOn: ["esencial"] },
  { key: "fase", label: "Fase", hideOn: ["esencial"] },
  { key: "responsable", label: "Responsable" },
  { key: "estatus", label: "Estatus", hideOn: ["esencial"] },
  { key: "prioridad", label: "Prioridad", hideOn: ["esencial"] },
  { key: "vence", label: "Vence", format: "date" },
  { key: "diasRetraso", label: "Días de retraso", format: "days", hideOn: ["esencial"] },
  { key: "subtareas", label: "Subtareas", align: "right", mono: true, hideOn: ["esencial"] },
];

/** Local calendar date as `YYYY-MM-DD`. */
export function localIsoDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The date a task is due: its commitment date, else its delivery date. */
export function taskDueDate(task: Pick<TaskListItem, "commitmentDate" | "deliveryDate">): string | null {
  const due = task.commitmentDate ?? task.deliveryDate ?? null;
  return due ? due.slice(0, 10) : null;
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Whole days an open task is past its due date; 0 when it is on time, closed or has no date. */
export function daysLate(task: TaskListItem, today: string): number {
  const due = taskDueDate(task);
  if (!due || isTaskClosed(task)) return 0;
  return Math.max(0, dayNumber(today) - dayNumber(due));
}

/** Every task of the board, in built-in status order (Pendiente, En proceso, Completado, Bloqueado). */
export function boardTasks(board: TaskBoard): TaskListItem[] {
  return BASE_STATUSES.flatMap((s) => board[s] ?? []);
}

export function tableroRow(task: TaskListItem, today: string): Record<string, unknown> {
  return {
    id: task.id,
    tarea: task.title,
    proyecto: task.project.name,
    tramo: task.workflow?.name ?? null,
    fase: task.phase?.name ?? null,
    responsable: task.manager?.name ?? null,
    estatus: taskStatusLabel(task),
    prioridad: PRIORITY_LABEL[task.priority],
    vence: taskDueDate(task),
    diasRetraso: daysLate(task, today),
    subtareas: task.subtaskCount > 0 ? `${task.subtaskDoneCount}/${task.subtaskCount}` : null,
  };
}

/**
 * The board's `RecordTableData`. Totals: task count, total days of delay
 * across the overdue tasks, and subtasks done / total.
 */
export function tableroTable(board: TaskBoard, today: string = localIsoDate()): RecordTableData {
  const tasks = boardTasks(board);
  const rows = tasks.map((t) => tableroRow(t, today));
  const subtasks = tasks.reduce((acc, t) => acc + t.subtaskCount, 0);
  const subtasksDone = tasks.reduce((acc, t) => acc + t.subtaskDoneCount, 0);
  return {
    columns: COLUMNS,
    rows,
    totals: {
      tarea: tasks.length === 1 ? "Total · 1 tarea" : `Total · ${tasks.length} tareas`,
      diasRetraso: rows.reduce((acc, r) => acc + (r.diasRetraso as number), 0),
      subtareas: subtasks > 0 ? `${subtasksDone}/${subtasks}` : "—",
    },
    heat: [{ key: "diasRetraso", warnAt: 0, critAt: 7 }],
  };
}
