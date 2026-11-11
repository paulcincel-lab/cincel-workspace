/**
 * Mi espacio "Mis tareas" and day helpers (pure, client-safe): due labels,
 * the Hoy / Esta semana / Después quick-add date presets, the row of the
 * Analítico table, the greeting and the day sentence of the hero. The
 * counts and the lists come from the server (`my-tasks-summary.ts`, #1051). Every "today" is the org's
 * local calendar date (`YYYY-MM-DD`, America/Mexico_City), handled as UTC
 * midnights so no browser clock zone leaks in.
 */
import { isTaskClosed, taskStatusLabel } from "@/lib/tasks/status-options";
import { addDays, dayOfWeek, localDate, localHourMinute, mondayOf } from "@/lib/time-tracking/local-time";
import type { TaskListItem } from "@/lib/types/core";
import type { Checklist } from "@/lib/types/redesign";
import { CSV_BOM, escapeCsvFormula } from "@/lib/utils/export-service";

export type DueTone = "overdue" | "today" | "soon" | "later" | "none";

/** Label wording: Visual ("Vencida · 6 nov", "Hoy") or Esencial ("7 nov · 2 d tarde", "hoy"). */
export type DueLabelVariant = "visual" | "esencial";

export type MyTaskBucket = "hoy" | "semana" | "despues";

export const MY_TASK_BUCKETS: readonly MyTaskBucket[] = ["hoy", "semana", "despues"];

export const MY_TASK_BUCKET_LABEL: Record<MyTaskBucket, string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  despues: "Después",
};

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const WEEKDAYS_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const DAY_MS = 86_400_000;

function utcOf(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / DAY_MS);
}

/** "6 nov". */
export function shortDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "Lunes 9 de noviembre". */
export function longDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = WEEKDAYS_LONG[d.getUTCDay()]!;
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${d.getUTCDate()} de ${MONTHS_LONG[d.getUTCMonth()]}`;
}

/** The commitment date part of a task date (`YYYY-MM-DD…` → `YYYY-MM-DD`). */
function dateOnly(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

/**
 * Tone and label of a task's commitment date, seen on `today`. `daysLate` is
 * > 0 only for overdue tasks. A blocked task adds " · bloqueada".
 */
export function dueInfo(
  task: Pick<TaskListItem, "commitmentDate" | "status">,
  today: string,
  variant: DueLabelVariant = "visual",
): { tone: DueTone; label: string; daysLate: number } {
  const blocked = task.status === "bloqueado" ? " · bloqueada" : "";
  const due = dateOnly(task.commitmentDate);
  if (!due) return { tone: "none", label: `Sin fecha${blocked}`, daysLate: 0 };
  const diff = daysBetween(today, due);
  if (diff < 0) {
    const daysLate = -diff;
    const label = variant === "esencial" ? `${shortDate(due)} · ${daysLate} d tarde` : `Vencida · ${shortDate(due)}`;
    return { tone: "overdue", label: `${label}${blocked}`, daysLate };
  }
  if (diff === 0) return { tone: "today", label: `${variant === "esencial" ? "hoy" : "Hoy"}${blocked}`, daysLate: 0 };
  if (diff === 1) return { tone: "soon", label: `mañana${blocked}`, daysLate: 0 };
  if (diff <= 6) {
    const weekday = WEEKDAYS_SHORT[dayOfWeek(due)];
    return { tone: "soon", label: `${weekday} ${shortDate(due)}${blocked}`, daysLate: 0 };
  }
  return { tone: "later", label: `${shortDate(due)}${blocked}`, daysLate: 0 };
}

/** Sunday of the Mon–Sun week holding `today`. */
export function sundayOf(today: string): string {
  return addDays(mondayOf(today), 6);
}

/**
 * The commitment date a column's quick add presets: Hoy → today; Esta
 * semana → Friday of this week (today from Friday on); Después → next Monday.
 */
export function bucketPresetDate(bucket: MyTaskBucket, today: string): string {
  if (bucket === "hoy") return today;
  if (bucket === "semana") {
    const friday = addDays(mondayOf(today), 4);
    return today >= friday ? today : friday;
  }
  return addDays(mondayOf(today), 7);
}

/** "Buenos días" (< 12:00), "Buenas tardes" (12:00–18:59), "Buenas noches" (≥ 19:00), org time; with the first name. */
export function greeting(now: Date, name: string): string {
  const hour = Number(localHourMinute(now).slice(0, 2));
  const salute = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first ? `${salute}, ${first}` : salute;
}

/** "9:05": the org wall time of an instant, hour without a leading zero. */
export function clockTime(at: Date | string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  const [hour = "0", minute = "00"] = localHourMinute(date).split(":");
  return `${Number(hour)}:${minute}`;
}

/** "Tienes 3 tareas para hoy" (0 → "No tienes tareas para hoy"). */
export function todayTasksText(count: number): string {
  if (count <= 0) return "No tienes tareas para hoy";
  return count === 1 ? "Tienes 1 tarea para hoy" : `Tienes ${count} tareas para hoy`;
}

/**
 * The hero sentence: "Lunes 9 de noviembre. Tienes 2 tareas para hoy y
 * «Llamar a obra» a las 16:00." The reminder part only when there is one
 * later today.
 */
export function daySentence(input: {
  now: Date;
  todayCount: number;
  reminder: { text: string; dueAt: string } | null;
}): string {
  const date = longDate(localDate(input.now));
  const tasks = todayTasksText(input.todayCount);
  const reminder = input.reminder ? ` y «${input.reminder.text}» a las ${clockTime(input.reminder.dueAt)}` : "";
  return `${date}. ${tasks}${reminder}.`;
}

/** The first live reminder due later today (org day), or null. */
export function nextReminderToday<R extends { dueAt: string; firedAt?: string | null; cancelledAt?: string | null }>(
  reminders: readonly R[],
  now: Date,
): R | null {
  const today = localDate(now);
  let best: R | null = null;
  for (const reminder of reminders) {
    if (reminder.cancelledAt) continue;
    const at = Date.parse(reminder.dueAt);
    if (!Number.isFinite(at) || at <= now.getTime()) continue;
    if (localDate(new Date(at)) !== today) continue;
    if (!best || at < Date.parse(best.dueAt)) best = reminder;
  }
  return best;
}

/** "hace un momento", "hace 12 min", "hace 3 h", "ayer", else "6 nov". */
export function timeAgo(iso: string, now: Date): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const minutes = Math.max(0, Math.floor((now.getTime() - at) / 60_000));
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const today = localDate(now);
  const day = localDate(new Date(at));
  if (day === today) return `hace ${Math.floor(minutes / 60)} h`;
  if (day === addDays(today, -1)) return "ayer";
  return shortDate(day);
}

/** A note's date line: "hoy", else "7 nov". */
export function noteDayLabel(iso: string, now: Date): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const day = localDate(new Date(at));
  return day === localDate(now) ? "hoy" : shortDate(day);
}

/** "{h} h {mm} min" of a worked duration. */
export function hoursMinutesText(seconds: number): string {
  const { h, mm } = hoursMinutes(seconds);
  return `${h} h ${mm} min`;
}

/** Whole hours and zero-padded minutes of a duration. */
export function hoursMinutes(seconds: number): { h: number; mm: string } {
  const total = Math.max(0, Math.floor(seconds / 60));
  return { h: Math.floor(total / 60), mm: String(total % 60).padStart(2, "0") };
}

// ── Esencial: Mis tareas by project ─────────────────────────────────────────

export type MyTasksRemaining = { count: number; projectNames: string[] };

/**
 * The remainder link text (without the arrow): "1 tarea más en Casa Lomas",
 * "5 tareas más en Casa Lomas y Torre Sur", "9 tareas más en Casa Lomas,
 * Torre Sur y 2 proyectos más". Empty when nothing is left out.
 */
export function remainderText(remaining: MyTasksRemaining): string {
  const { count, projectNames } = remaining;
  if (count <= 0) return "";
  const head = `${count} ${count === 1 ? "tarea" : "tareas"} más`;
  const [p1, p2] = projectNames;
  if (projectNames.length === 0) return head;
  if (projectNames.length === 1) return `${head} en ${p1}`;
  if (projectNames.length === 2) return `${head} en ${p1} y ${p2}`;
  const k = projectNames.length - 2;
  return `${head} en ${p1}, ${p2} y ${k} ${k === 1 ? "proyecto" : "proyectos"} más`;
}

// ── Analítico: Mis tareas, metrics, checklists and the CSV ─────────────────

/** Days late from which the "Días de retraso" cell reads as a warning (Analítico). */
export const DAYS_LATE_WARN = 5;

/** One row of the Analítico Mis tareas table (flat values the table, the filters and the CSV read). */
export type TaskRow = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  /** The task's tramo (workflow); null = "Sin tramo". */
  tramoId: string | null;
  tramoKey: string | null;
  tramoName: string;
  tramoSortOrder: number;
  status: TaskListItem["status"];
  customStatus: TaskListItem["customStatus"];
  /** The Responsable (can't also be apoyo). */
  managerId: string | null;
  /** The equipo de apoyo (#1038). */
  support: TaskListItem["support"];
  /** Status label: the custom status name over the base label. */
  estatus: string;
  /** Commitment date `YYYY-MM-DD`, or null. */
  due: string | null;
  /** "7 nov", "hoy" or "—". */
  vence: string;
  overdue: boolean;
  blocked: boolean;
  prioridad: string;
  /** "1/3" or "—". */
  subtareas: string;
  /** Days late (0 unless overdue). */
  retraso: number;
};

export const SIN_TRAMO = "Sin tramo";

const PRIORITY_LABEL: Record<TaskListItem["priority"], string> = { alta: "Alta", media: "Media", baja: "Baja" };

/** The row of one open task, seen on `today`. */
export function taskRow(task: TaskListItem, today: string): TaskRow {
  // A closed task (shown with "Ocultar completadas" off) is never late.
  const closed = isTaskClosed(task);
  const due0 = dueInfo(task, today);
  const info = closed && due0.tone === "overdue" ? { ...due0, tone: "none" as const, daysLate: 0 } : due0;
  const due = dateOnly(task.commitmentDate);
  const workflow = task.workflow;
  return {
    id: task.id,
    title: task.title,
    projectId: task.project?.id ?? task.projectId,
    projectName: task.project?.name ?? "",
    tramoId: workflow?.id ?? null,
    tramoKey: workflow?.key ?? null,
    tramoName: workflow?.name ?? SIN_TRAMO,
    tramoSortOrder: workflow?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    status: task.status,
    customStatus: task.customStatus,
    managerId: task.managerId,
    support: task.support,
    estatus: taskStatusLabel(task),
    due,
    vence: due ? (info.tone === "today" ? "hoy" : shortDate(due)) : "—",
    overdue: info.tone === "overdue",
    blocked: task.status === "bloqueado",
    prioridad: PRIORITY_LABEL[task.priority] ?? task.priority,
    subtareas: task.subtaskCount > 0 ? `${task.subtaskDoneCount}/${task.subtaskCount}` : "—",
    retraso: info.daysLate,
  };
}

/** Id of a tramo group inside its project group. */
export function tramoGroupId(projectId: string, tramoId: string | null): string {
  return `${projectId}:${tramoId ?? "sin-tramo"}`;
}

export type ChecklistMetrics = {
  /** Checklists. */
  active: number;
  /** Items done / all items of every checklist. */
  done: number;
  total: number;
  /** Whole percent done ÷ total; null without items. */
  pct: number | null;
  /** Average of the per-checklist percents (checklists with items); null without any. */
  avgPct: number | null;
};

/** Whole percent of one checklist; null without items. */
export function checklistPct(checklist: Pick<Checklist, "items">): number | null {
  const total = checklist.items.length;
  if (total === 0) return null;
  return Math.round((checklist.items.filter((item) => item.done).length / total) * 100);
}

/** Totals of the Checklists header, KPI and footer. */
export function checklistMetrics(checklists: readonly Pick<Checklist, "items">[]): ChecklistMetrics {
  let done = 0;
  let total = 0;
  const pcts: number[] = [];
  for (const checklist of checklists) {
    total += checklist.items.length;
    done += checklist.items.filter((item) => item.done).length;
    const pct = checklistPct(checklist);
    if (pct !== null) pcts.push(pct);
  }
  return {
    active: checklists.length,
    done,
    total,
    pct: total === 0 ? null : Math.round((done / total) * 100),
    avgPct: pcts.length === 0 ? null : Math.round(pcts.reduce((sum, pct) => sum + pct, 0) / pcts.length),
  };
}

export const MI_ESPACIO_CSV_HEADER = [
  "Proyecto",
  "Tramo",
  "Tarea",
  "Estatus",
  "Vence",
  "Prioridad",
  "Subtareas",
  "Días de retraso",
] as const;

/** One `;` CSV cell: formula-escaped, quoted when it holds `;`, a quote or a line break. */
function csvCellSemicolon(value: string | number): string {
  const escaped = escapeCsvFormula(String(value));
  return /[";\r\n]/.test(escaped) ? `"${escaped.replace(/"/g, '""')}"` : escaped;
}

/** The Mis tareas rows as a CSV for spreadsheets: UTF-8 BOM, `;` separator, CRLF lines. */
export function miEspacioCsv(rows: readonly TaskRow[]): string {
  const lines = [
    [...MI_ESPACIO_CSV_HEADER],
    ...rows.map((row) => [
      row.projectName,
      row.tramoName,
      row.title,
      row.estatus,
      row.due ?? "",
      row.prioridad,
      row.subtareas === "—" ? "" : row.subtareas,
      row.retraso,
    ]),
  ].map((line) => line.map(csvCellSemicolon).join(";"));
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}

/** "mi-espacio-tareas-2026-11-09.csv". */
export function miEspacioCsvFileName(today: string): string {
  return `mi-espacio-tareas-${today}.csv`;
}
