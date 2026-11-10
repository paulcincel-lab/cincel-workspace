/**
 * Proyecto · Tareas tab (redesign FE §3.5, §4.6): the project's tasks grouped
 * by fase (tramo when the project has no fase data), with progress per group,
 * the URL filters of the tab and the `RecordTableData` the grouped
 * `RecordTable` renders in the three styles. Pure and client-safe.
 *
 * Grouping reuses `groupFichaTasks` (tramo order, fase catalog order, "Sin fase
 * · revisar" last, "Sin tramo", and "Administración" only for administrators).
 */
import { tramoLabel } from "@/lib/tramos/compat";
import { ADMIN_GROUP_LABEL, groupFichaTasks } from "@/lib/proyectos/task-groups";
import { isDueDateLate, isTaskClosed, isTaskCompleted, taskStatusLabel } from "@/lib/tasks/status-options";
import type { TaskListItem, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";
import type { RecordTableData } from "@/lib/types/widgets";

/** A task of the tab: the slim `TaskListRow` (or a full `TaskListItem`); `notes` is never read. */
export type ProjectTask = Omit<TaskListItem, "notes">;

// ── Filters ──────────────────────────────────────────────────────────────────

export type ProjectTaskEstado = "todas" | "abiertas" | "vencidas" | "completadas";

export const PROJECT_TASK_ESTADOS: readonly ProjectTaskEstado[] = ["todas", "abiertas", "vencidas", "completadas"];

export const PROJECT_TASK_ESTADO_LABEL: Record<ProjectTaskEstado, string> = {
  todas: "Todas",
  abiertas: "Abiertas",
  vencidas: "Vencidas",
  completadas: "Completadas",
};

/** `?estado=&responsable=&q=` of `/proyectos/[id]/tareas`. `responsable` is a staff id or "sin" (unassigned). */
export type ProjectTasksQuery = { estado: ProjectTaskEstado; responsable: string | null; q: string };

export const UNASSIGNED_FILTER = "sin";

type SearchParamValue = string | string[] | undefined;

function first(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseProjectTasksQuery(sp: Record<string, SearchParamValue>): ProjectTasksQuery {
  const estado = first(sp.estado);
  const responsable = first(sp.responsable)?.trim() || null;
  return {
    estado: PROJECT_TASK_ESTADOS.includes(estado as ProjectTaskEstado) ? (estado as ProjectTaskEstado) : "todas",
    responsable,
    q: first(sp.q)?.trim() ?? "",
  };
}

/** Href of the tab with `patch` applied; default values are left out of the URL. */
export function projectTasksHref(projectId: string, query: ProjectTasksQuery, patch: Partial<ProjectTasksQuery> = {}): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.estado !== "todas") params.set("estado", next.estado);
  if (next.responsable) params.set("responsable", next.responsable);
  if (next.q) params.set("q", next.q);
  const search = params.toString();
  return `/proyectos/${encodeURIComponent(projectId)}/tareas${search ? `?${search}` : ""}`;
}

/** Local calendar day `YYYY-MM-DD` (due dates are calendar days). */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isTaskLate(task: ProjectTask, today: string): boolean {
  return isDueDateLate(task.commitmentDate, today, task);
}

export function matchesEstado(task: ProjectTask, estado: ProjectTaskEstado, today: string): boolean {
  switch (estado) {
    case "todas":
      return true;
    case "abiertas":
      return !isTaskClosed(task);
    case "vencidas":
      return isTaskLate(task, today);
    case "completadas":
      return isTaskCompleted(task);
  }
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Responsable and search filters (the estado chip is applied separately so chip counts stay stable). */
export function filterByPersonAndSearch(tasks: ProjectTask[], query: Pick<ProjectTasksQuery, "responsable" | "q">): ProjectTask[] {
  const q = normalize(query.q.trim());
  return tasks.filter((task) => {
    if (query.responsable === UNASSIGNED_FILTER && task.managerId) return false;
    if (query.responsable && query.responsable !== UNASSIGNED_FILTER && task.managerId !== query.responsable) return false;
    if (q && !normalize(task.title).includes(q)) return false;
    return true;
  });
}

/** Chip counts per estado over `tasks`. */
export function estadoCounts(tasks: ProjectTask[], today: string): Record<ProjectTaskEstado, number> {
  const counts: Record<ProjectTaskEstado, number> = { todas: 0, abiertas: 0, vencidas: 0, completadas: 0 };
  for (const task of tasks) {
    for (const estado of PROJECT_TASK_ESTADOS) if (matchesEstado(task, estado, today)) counts[estado] += 1;
  }
  return counts;
}

/** People who manage at least one of the tasks, by name. */
export function responsableOptions(tasks: ProjectTask[]): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const task of tasks) if (task.manager) byId.set(task.manager.id, task.manager.name);
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// ── Groups ───────────────────────────────────────────────────────────────────

export type ProjectTaskGroupMode = "fase" | "tramo";

export type ProjectTaskGroup = {
  id: string;
  label: string;
  kind: "fase" | "tramo" | "sin_tramo" | "admin";
  tramo: WorkflowRef | null;
  phase: WorkflowPhaseRef | null;
  tasks: ProjectTask[];
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  lateOrBlocked: number;
  /** Completed / total, 0–100 rounded. */
  progressPct: number;
};

/**
 * Rows of the tab: subtareas are counted on their parent ("Subtareas"), so
 * only top-level tasks are listed; a subtarea whose parent is not in the list
 * (deleted, archived or filtered out by the server) is listed on its own.
 */
export function topLevelTasks(tasks: ProjectTask[]): ProjectTask[] {
  const ids = new Set(tasks.map((task) => task.id));
  return tasks.filter((task) => !task.parentTaskId || !ids.has(task.parentTaskId));
}

/** True when any non-admin task carries a fase: the tab then groups by fase, else by tramo. */
export function hasPhaseData(tasks: ProjectTask[]): boolean {
  return tasks.some((task) => task.kind !== "admin" && task.phase !== null);
}

function tramoName(tramo: WorkflowRef): string {
  return tramo.name.trim() || tramoLabel(tramo.key);
}

function summarize(
  base: Omit<ProjectTaskGroup, "total" | "completed" | "inProgress" | "pending" | "lateOrBlocked" | "progressPct">,
  today: string,
): ProjectTaskGroup {
  let completed = 0;
  let inProgress = 0;
  let pending = 0;
  let lateOrBlocked = 0;
  for (const task of base.tasks) {
    if (isTaskCompleted(task)) completed += 1;
    else if (task.status === "en_proceso") inProgress += 1;
    else if (task.status === "pendiente") pending += 1;
    if (task.status === "bloqueado" || isTaskLate(task, today)) lateOrBlocked += 1;
  }
  const total = base.tasks.length;
  return {
    ...base,
    total,
    completed,
    inProgress,
    pending,
    lateOrBlocked,
    progressPct: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

/**
 * Groups for the tab. With fase data: one group per (tramo, fase), labelled
 * with the fase name ("Tramo · Fase" when the project spans several tramos).
 * Without: one group per tramo. Admin tasks form "Administración" only when
 * `includeAdmin` (the viewer passes `canSeeAdminData`); the server already
 * leaves them out for everyone else.
 */
export function groupProjectTasks(
  tasks: ProjectTask[],
  options: { includeAdmin: boolean; today: string },
): { mode: ProjectTaskGroupMode; groups: ProjectTaskGroup[] } {
  const rows = topLevelTasks(tasks);
  const visible = options.includeAdmin ? rows : rows.filter((task) => task.kind !== "admin");
  const mode: ProjectTaskGroupMode = hasPhaseData(visible) ? "fase" : "tramo";
  const tramoGroups = groupFichaTasks(visible, { includeAdmin: options.includeAdmin });
  const multiTramo = tramoGroups.filter((group) => group.kind === "tramo").length > 1;

  const groups: ProjectTaskGroup[] = [];
  for (const tramoGroup of tramoGroups) {
    if (tramoGroup.kind === "admin") {
      groups.push(
        summarize(
          {
            id: tramoGroup.id,
            label: ADMIN_GROUP_LABEL,
            kind: "admin",
            tramo: null,
            phase: null,
            tasks: tramoGroup.phases.flatMap((p) => p.tasks),
          },
          options.today,
        ),
      );
      continue;
    }
    if (tramoGroup.kind === "sin_tramo" || !tramoGroup.tramo) {
      groups.push(
        summarize(
          {
            id: tramoGroup.id,
            label: tramoGroup.name,
            kind: "sin_tramo",
            tramo: null,
            phase: null,
            tasks: tramoGroup.phases.flatMap((p) => p.tasks),
          },
          options.today,
        ),
      );
      continue;
    }
    const tramo = tramoGroup.tramo;
    const name = tramoName(tramo);
    if (mode === "tramo") {
      groups.push(
        summarize(
          { id: tramo.id, label: name, kind: "tramo", tramo, phase: null, tasks: tramoGroup.phases.flatMap((p) => p.tasks) },
          options.today,
        ),
      );
      continue;
    }
    for (const phaseGroup of tramoGroup.phases) {
      groups.push(
        summarize(
          {
            id: `${tramo.id}:${phaseGroup.id}`,
            label: multiTramo ? `${name} · ${phaseGroup.name}` : phaseGroup.name,
            kind: "fase",
            tramo,
            phase: phaseGroup.phase,
            tasks: phaseGroup.tasks,
          },
          options.today,
        ),
      );
    }
  }
  return { mode, groups };
}

/** Group label as the grouped table shows it: "Instalaciones · 90%". */
export function groupHeading(group: ProjectTaskGroup): string {
  return `${group.label} · ${group.progressPct}%`;
}

// ── Table data ───────────────────────────────────────────────────────────────

const DUE_DATE = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

/** "22 jul" (es-MX, lowercase); "—" without a date. */
export function formatDueDate(date: string | null): string {
  if (!date) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return date;
  return DUE_DATE.format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).toLowerCase().replace(".", "");
}

function dayDiff(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Analítico "Días": "38 d tarde", "en 6 d", "hoy"; "—" when closed or undated. */
export function dueDaysText(task: ProjectTask, today: string): string {
  if (!task.commitmentDate || isTaskClosed(task)) return "—";
  const diff = dayDiff(today, task.commitmentDate.slice(0, 10));
  if (diff === 0) return "hoy";
  return diff < 0 ? `${-diff} d tarde` : `en ${diff} d`;
}

/** "2/4"; "—" without subtareas. */
export function subtasksText(task: ProjectTask): string {
  return task.subtaskCount > 0 ? `${task.subtaskDoneCount}/${task.subtaskCount}` : "—";
}

/** Task progress: 100 when completed, else the share of done subtareas. */
export function taskProgressPct(task: ProjectTask): number {
  if (isTaskCompleted(task)) return 100;
  return task.subtaskCount > 0 ? Math.round((task.subtaskDoneCount / task.subtaskCount) * 100) : 0;
}

export const UNASSIGNED_LABEL = "Sin asignar";

export const TASK_GROUP_KEY = "grupo";

/** Row of the grouped tasks table; `task` feeds `renderCell` (status chip, link, late date). */
export type ProjectTaskRow = Record<string, unknown> & { id: string; task: ProjectTask; groupId: string };

/**
 * The grouped tasks table: Estatus, Tarea, Responsable, Vence, Subtareas
 * (+ Días and % in Analítico). Esencial drops the status chip column and
 * shows the status as text after the title (its first column is the title).
 */
export function buildTasksTable(groups: ProjectTaskGroup[], today: string): RecordTableData {
  const rows: ProjectTaskRow[] = groups.flatMap((group) =>
    group.tasks.map((task) => ({
      id: task.id,
      task,
      groupId: group.id,
      [TASK_GROUP_KEY]: groupHeading(group),
      estatus: taskStatusLabel(task),
      tarea: task.title,
      estatusTexto: isTaskLate(task, today) ? "Vencida" : taskStatusLabel(task),
      responsable: task.manager?.name ?? UNASSIGNED_LABEL,
      // The cell renders the avatars; the names are its text value.
      apoyo: task.support.length > 0 ? task.support.map((s) => s.name).join(", ") : null,
      vence: formatDueDate(task.commitmentDate),
      dias: dueDaysText(task, today),
      subtareas: subtasksText(task),
      avance: taskProgressPct(task),
    })),
  );
  return {
    columns: [
      { key: "estatus", label: "Estatus", hideOn: ["esencial"] },
      { key: "tarea", label: "Tarea" },
      { key: "estatusTexto", label: "Estatus", hideOn: ["visual", "analitico"] },
      { key: "responsable", label: "Responsable" },
      { key: "apoyo", label: "Apoyo", hideOn: ["esencial"] },
      { key: "vence", label: "Vence" },
      { key: "dias", label: "Días", hideOn: ["visual", "esencial"] },
      { key: "subtareas", label: "Subtareas", align: "right" },
      { key: "avance", label: "%", format: "percent", hideOn: ["visual", "esencial"] },
    ],
    rows,
    groupBy: TASK_GROUP_KEY,
  };
}

/** Row of the per-group summary; `group` feeds the "Agregar tarea" cell. */
export type ProjectGroupRow = Record<string, unknown> & { id: string; group: ProjectTaskGroup };

/**
 * Per-group summary ("Avance por fase" / "Avance por tramo"): name, tareas,
 * avance and the "Agregar tarea" action in every style; the status breakdown
 * and the totals row only in Analítico.
 */
export function buildGroupsTable(groups: ProjectTaskGroup[], mode: ProjectTaskGroupMode): RecordTableData {
  const rows: ProjectGroupRow[] = groups.map((group) => ({
    id: group.id,
    group,
    nombre: group.label,
    total: group.total,
    completadas: group.completed,
    enProceso: group.inProgress,
    pendientes: group.pending,
    vencidas: group.lateOrBlocked,
    avance: group.progressPct,
    agregar: "",
  }));
  const sum = (pick: (g: ProjectTaskGroup) => number) => groups.reduce((acc, g) => acc + pick(g), 0);
  const total = sum((g) => g.total);
  const completed = sum((g) => g.completed);
  return {
    columns: [
      { key: "nombre", label: mode === "fase" ? "Fase" : "Tramo" },
      { key: "total", label: "Tareas", format: "count" },
      { key: "completadas", label: "Completadas", format: "count", hideOn: ["visual", "esencial"] },
      { key: "enProceso", label: "En proceso", format: "count", hideOn: ["visual", "esencial"] },
      { key: "pendientes", label: "Pendientes", format: "count", hideOn: ["visual", "esencial"] },
      { key: "vencidas", label: "Vencidas / bloq.", format: "count", hideOn: ["visual", "esencial"] },
      { key: "avance", label: "Avance", format: "percent" },
      { key: "agregar", label: "Acciones", align: "right" },
    ],
    rows,
    totals: {
      nombre: "Total",
      total,
      completadas: completed,
      enProceso: sum((g) => g.inProgress),
      pendientes: sum((g) => g.pending),
      vencidas: sum((g) => g.lateOrBlocked),
      avance: total === 0 ? 0 : Math.round((completed / total) * 100),
      agregar: "",
    },
  };
}

/** Admin tasks are created from their own card; every other group offers "+ Agregar tarea". */
export function canAddToGroup(group: ProjectTaskGroup): boolean {
  return group.kind !== "admin";
}
