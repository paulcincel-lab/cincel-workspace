/**
 * Mi espacio "Mis tareas" and day helpers (pure, client-safe): due labels,
 * the Hoy / Esta semana / Después buckets, the quick-add date presets, the
 * greeting and the day sentence of the hero. Every "today" is the org's
 * local calendar date (`YYYY-MM-DD`, America/Mexico_City), handled as UTC
 * midnights so no browser clock zone leaks in.
 */
import type { Group } from "@/components/widgets/GroupedTable";
import { taskStatusLabel } from "@/lib/tasks/status-options";
import { addDays, dayOfWeek, localDate, localHourMinute, mondayOf } from "@/lib/time-tracking/local-time";
import { tramoColorVar } from "@/lib/tramos/tramo-color";
import type { TaskListItem } from "@/lib/types/core";
import type { Checklist } from "@/lib/types/redesign";
import { CSV_BOM, escapeCsvFormula } from "@/lib/utils/export-service";

export type DueTone = "overdue" | "today" | "soon" | "later" | "none";

/** Label wording: Visual ("Vencida · 6 nov", "Hoy") or Esencial ("7 nov · 2 d tarde", "hoy"). */
export type DueLabelVariant = "visual" | "esencial";

export type MyTaskBuckets = { hoy: TaskListItem[]; semana: TaskListItem[]; despues: TaskListItem[] };
export type MyTaskBucket = keyof MyTaskBuckets;

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
 * Hoy = overdue and due today; Esta semana = tomorrow … Sunday of this week;
 * Después = later or undated. Order inside a bucket is kept.
 */
export function bucketMyTasks(tasks: readonly TaskListItem[], today: string): MyTaskBuckets {
  const sunday = sundayOf(today);
  const out: MyTaskBuckets = { hoy: [], semana: [], despues: [] };
  for (const task of tasks) out[bucketOf(task, today, sunday)].push(task);
  return out;
}

function bucketOf(task: Pick<TaskListItem, "commitmentDate">, today: string, sunday: string): MyTaskBucket {
  const due = dateOnly(task.commitmentDate);
  if (!due) return "despues";
  if (due <= today) return "hoy";
  if (due <= sunday) return "semana";
  return "despues";
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

/** Open tasks only (no `completado`, no closing custom status), by commitment date (undated last), then title. */
export function openTasksInOrder(rows: readonly TaskListItem[]): TaskListItem[] {
  return rows
    .filter((task) => task.status !== "completado" && !task.customStatus?.closes)
    .sort((a, b) => {
      const da = dateOnly(a.commitmentDate);
      const db = dateOnly(b.commitmentDate);
      if (da !== db) {
        if (da === null) return 1;
        if (db === null) return -1;
        return da < db ? -1 : 1;
      }
      return a.title.localeCompare(b.title, "es");
    });
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

export type MyTasksGroup = { projectId: string; name: string; tasks: TaskListItem[] };
export type MyTasksRemaining = { count: number; projectNames: string[] };

/** Commitment date ascending (undated last), then title. */
function byDueThenTitle(a: TaskListItem, b: TaskListItem): number {
  const da = dateOnly(a.commitmentDate);
  const db = dateOnly(b.commitmentDate);
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return da < db ? -1 : 1;
  }
  return a.title.localeCompare(b.title, "es");
}

/**
 * Mis tareas by project (Esencial): projects with an overdue task first, then
 * by their nearest commitment date (undated last), then by name; at most
 * `limits.projects` groups of `limits.perProject` rows each, by due date.
 * `remaining` counts every task left out and names their projects in order.
 */
export function groupMyTasksByProject(
  tasks: readonly TaskListItem[],
  today: string,
  limits: { projects: number; perProject: number } = { projects: 3, perProject: 4 },
): { groups: MyTasksGroup[]; remaining: MyTasksRemaining } {
  const byProject = new Map<string, MyTasksGroup>();
  for (const task of tasks) {
    const id = task.project?.id ?? task.projectId;
    let group = byProject.get(id);
    if (!group) {
      group = { projectId: id, name: task.project?.name ?? "", tasks: [] };
      byProject.set(id, group);
    }
    group.tasks.push(task);
  }
  const all = [...byProject.values()].map((g) => ({ ...g, tasks: [...g.tasks].sort(byDueThenTitle) }));
  const overdue = new Set(
    all.filter((g) => g.tasks.some((t) => dueInfo(t, today).tone === "overdue")).map((g) => g.projectId),
  );
  all.sort((a, b) => {
    const late = Number(overdue.has(b.projectId)) - Number(overdue.has(a.projectId));
    if (late !== 0) return late;
    const da = dateOnly(a.tasks[0]!.commitmentDate);
    const db = dateOnly(b.tasks[0]!.commitmentDate);
    if (da !== db) {
      if (da === null) return 1;
      if (db === null) return -1;
      return da < db ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "es");
  });

  const groups: MyTasksGroup[] = [];
  const remaining: MyTasksRemaining = { count: 0, projectNames: [] };
  all.forEach((group, index) => {
    const shown = index < limits.projects ? group.tasks.slice(0, limits.perProject) : [];
    const hidden = group.tasks.length - shown.length;
    if (shown.length > 0) groups.push({ ...group, tasks: shown });
    if (hidden > 0) {
      remaining.count += hidden;
      remaining.projectNames.push(group.name);
    }
  });
  return { groups, remaining };
}

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
  const info = dueInfo(task, today);
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

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Id of a tramo group inside its project group. */
export function tramoGroupId(projectId: string, tramoId: string | null): string {
  return `${projectId}:${tramoId ?? "sin-tramo"}`;
}

/**
 * Mis tareas grouped project → tramo (Analítico). Projects with an overdue
 * task first, then by name; tramos by their order ("Sin tramo" last); rows by
 * commitment date (undated last), then title. Project metric: "{k} vencida ·
 * {max} d" or "0 vencidas"; tramo caption "{n} · {k} vencidas" (+ " ·
 * bloqueada" when one is blocked).
 */
export function myTasksGroups(tasks: readonly TaskListItem[], today: string): Group<TaskRow>[] {
  const ordered = [...tasks].sort(byDueThenTitle).map((task) => taskRow(task, today));
  const projects = new Map<string, { name: string; rows: TaskRow[] }>();
  for (const row of ordered) {
    const project = projects.get(row.projectId) ?? { name: row.projectName, rows: [] };
    project.rows.push(row);
    projects.set(row.projectId, project);
  }
  const groups = [...projects.entries()].map(([projectId, project]) => {
    const overdue = project.rows.filter((row) => row.overdue);
    const maxLate = overdue.reduce((max, row) => Math.max(max, row.retraso), 0);
    const tramos = new Map<string, { row: TaskRow; rows: TaskRow[] }>();
    for (const row of project.rows) {
      const id = tramoGroupId(projectId, row.tramoId);
      const tramo = tramos.get(id) ?? { row, rows: [] };
      tramo.rows.push(row);
      tramos.set(id, tramo);
    }
    const children: Group<TaskRow>[] = [...tramos.entries()]
      .sort(([, a], [, b]) => a.row.tramoSortOrder - b.row.tramoSortOrder || a.row.tramoName.localeCompare(b.row.tramoName, "es"))
      .map(([id, tramo]) => {
        const late = tramo.rows.filter((row) => row.overdue).length;
        const blocked = tramo.rows.some((row) => row.blocked) ? " · bloqueada" : "";
        return {
          id,
          label: tramo.row.tramoName,
          color: tramo.row.tramoKey
            ? tramoColorVar({ key: tramo.row.tramoKey, sortOrder: tramo.row.tramoSortOrder })
            : undefined,
          caption: `${tramo.rows.length} · ${plural(late, "vencida", "vencidas")}${blocked}`,
          metrics: [],
          rows: tramo.rows,
        };
      });
    const group: Group<TaskRow> = {
      id: projectId,
      label: project.name,
      caption: plural(project.rows.length, "tarea", "tareas"),
      metrics: [
        overdue.length > 0
          ? { key: "vencidas", value: `${plural(overdue.length, "vencida", "vencidas")} · ${maxLate} d`, tone: "destructive" }
          : { key: "vencidas", value: "0 vencidas", tone: "muted" },
      ],
      children,
    };
    return { group, late: overdue.length > 0 };
  });
  groups.sort((a, b) => Number(b.late) - Number(a.late) || a.group.label.localeCompare(b.group.label, "es"));
  return groups.map((entry) => entry.group);
}

export type TaskMetrics = {
  open: number;
  overdue: number;
  /** Whole percent of open tasks that are overdue (0 without tasks). */
  overduePct: number;
  /** Average days late of the overdue tasks, one decimal (0 without overdue). */
  avgDaysLate: number;
  /** Distinct projects. */
  projects: number;
};

/** Counts of the Mis tareas header and KPIs. */
export function taskMetrics(tasks: readonly TaskListItem[], today: string): TaskMetrics {
  let overdue = 0;
  let late = 0;
  const projects = new Set<string>();
  for (const task of tasks) {
    projects.add(task.project?.id ?? task.projectId);
    const info = dueInfo(task, today);
    if (info.tone === "overdue") {
      overdue += 1;
      late += info.daysLate;
    }
  }
  const open = tasks.length;
  return {
    open,
    overdue,
    overduePct: open === 0 ? 0 : Math.round((overdue / open) * 100),
    avgDaysLate: overdue === 0 ? 0 : Math.round((late / overdue) * 10) / 10,
    projects: projects.size,
  };
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
