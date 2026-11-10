/**
 * Inicio data (redesign BE §7.10): pure helpers `fetchInicioAction` composes
 * with the metrics helper (`lib/metrics/series.ts`) and the widget builders
 * (`lib/metrics/widgets.ts`). Dates are calendar dates in the app's time zone
 * (`TASK_TREND_TIME_ZONE`), handled as `YYYY-MM-DD` strings.
 *
 * Daily KPI points for past days come from the task / project rows as they
 * are now plus their `status` history (`history_events`): the status a row
 * had at the end of a past day is the `before` of its first status change
 * after that day, else its current status.
 */
import { zonedIsoMinute } from "@/lib/dates/zoned-formatters";
import { ADMIN_TRAMO_LABEL } from "@/lib/calendar/calendar-service";
import { NO_TRAMO_LABEL } from "@/lib/dashboard/donut-groups";
import { localIsoDate, TASK_TREND_TIME_ZONE, type TaskTrendBucket } from "@/lib/dashboard/task-trend";
import type { DailyCounter } from "@/lib/metrics/series";
import { isTaskClosed } from "@/lib/tasks/status-options";
import type { ProjectListItem, Staff, TaskListItem } from "@/lib/types/core";
import type { PeopleOverviewRow, PortfolioRow } from "@/lib/types/redesign";
import type { AgendaItem, TramoKey } from "@/lib/types/widgets";

const DAY_MS = 86_400_000;

/** Weeks in `InicioData.weeklyPace`: a fixed window the client slices to 4 / 8 / 12 (`sliceToRange`). */
export const INICIO_PACE_WEEKS = 12;
/** Daily points behind each KPI (avg30 / min30 / max30). */
export const INICIO_KPI_DAYS = 30;
/** "Revisiones · 7 días": reviews from the day through the next 6. */
export const REVIEW_WINDOW_DAYS = 7;
/** "Completadas · semana": completions in the day and the 6 before it. */
export const COMPLETED_WINDOW_DAYS = 7;

/** Group keys of tasks without a tramo (calendar keys, BE §8.8). */
export const NO_TRAMO_KEY = "sin-tramo";
export const ADMIN_TRAMO_KEY = "admin";

export const INICIO_KPI = {
  proyectosActivos: { key: "proyectos_activos", label: "Proyectos activos", href: "/proyectos" },
  vencidas: { key: "vencidas", label: "Vencidas", href: "/tareas?vista=lista" },
  bloqueadas: { key: "bloqueadas", label: "Bloqueadas", href: "/tareas?vista=lista&estado=bloqueado" },
  revisiones: { key: "revisiones_7d", label: "Revisiones · 7 días", href: "/tareas?vista=calendario&cal=semana" },
  completadas: { key: "completadas_semana", label: "Completadas · semana", href: "/tareas?vista=lista&estado=completado" },
  abiertas: { key: "abiertas", label: "Tareas abiertas", href: "/tareas" },
  horasSemana: { key: "horas_semana", label: "Horas esta semana", href: "/mi-espacio" },
} as const;

/** The "Horas esta semana" label for a viewer without team workload access (their own hours). */
export const INICIO_KPI_OWN_HOURS_LABEL = "Mis horas esta semana";

// ── Dates ───────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` shifted by `n` calendar days. */
export function shiftIsoDate(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b − a). */
export function isoDaysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Local calendar date of an instant (ISO string or Date). */
export function localDayOf(at: string | Date, tz: string = TASK_TREND_TIME_ZONE): string {
  return localIsoDate(typeof at === "string" ? new Date(at) : at, tz);
}

/** Every date of `[from, to]`, ascending. */
export function isoDateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to; day = shiftIsoDate(day, 1)) out.push(day);
  return out;
}

/** ISO-8601 week number of the week starting on Monday `monday`. */
function isoWeekNumber(monday: string): number {
  const thursday = new Date(Date.parse(`${shiftIsoDate(monday, 3)}T00:00:00Z`));
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
}

/**
 * `weeks` Monday–Sunday buckets, oldest first, the last one being the
 * current week (labels `S44`). Same shape as `taskTrendBuckets`, so
 * `bucketTaskTrend` and `weeklyCounts` take them as they are.
 */
export function inicioWeekBuckets(
  now: Date,
  tz: string = TASK_TREND_TIME_ZONE,
  weeks: number = INICIO_PACE_WEEKS,
): TaskTrendBucket[] {
  const today = localIsoDate(now, tz);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const currentMonday = shiftIsoDate(today, -weekday);
  return Array.from({ length: weeks }, (_, i) => {
    const from = shiftIsoDate(currentMonday, -7 * (weeks - 1 - i));
    return { label: `S${isoWeekNumber(from)}`, from, to: shiftIsoDate(from, 6) };
  });
}

// ── Status history ──────────────────────────────────────────────────────────

/** A `cambio` on `status` of a task or project. */
export type StatusEvent = { entityId: string; at: Date; before: string | null; after: string | null };

/** Status of a row at the end of a local day. */
export type StatusAt = (id: string, current: string, day: string) => string;

/**
 * The status a row had at the end of `day`: the `before` of its first status
 * change on a later day, else `current`. Today therefore always reads the
 * current status.
 */
export function statusResolver(events: StatusEvent[], tz: string = TASK_TREND_TIME_ZONE): StatusAt {
  const byId = new Map<string, { day: string; before: string | null }[]>();
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const list = byId.get(e.entityId) ?? [];
    list.push({ day: localIsoDate(e.at, tz), before: e.before });
    byId.set(e.entityId, list);
  }
  return (id, current, day) => {
    const next = byId.get(id)?.find((e) => e.day > day);
    return next?.before ?? current;
  };
}

/** A daily counter over in-memory rows: `countOn(day)` for every day of the range. */
export function inMemoryCounter(countOn: (day: string) => number): DailyCounter {
  return async (from, to) => new Map(isoDateRange(from, to).map((day) => [day, countOn(day)]));
}

// ── Task and project state on a day ─────────────────────────────────────────

type DatedTask = Pick<
  TaskListItem,
  "id" | "status" | "customStatus" | "createdAt" | "commitmentDate" | "reviewDate"
>;

/** Current base status, closing custom statuses read as `completado`. */
export function currentTaskStatus(task: Pick<TaskListItem, "status" | "customStatus">): string {
  return isTaskClosed(task) ? "completado" : task.status;
}

export type TaskDayState = {
  /** Existed and was not completado at the end of the day. */
  open(task: DatedTask, day: string): boolean;
  overdue(task: DatedTask, day: string): boolean;
  blocked(task: DatedTask, day: string): boolean;
  /** Open with a review date in `[day, day + 6]`. */
  reviewDue(task: DatedTask, day: string): boolean;
};

export function taskDayState(statusAt: StatusAt, tz: string = TASK_TREND_TIME_ZONE): TaskDayState {
  // Each task's local creation day is computed once, not once per day per check.
  const createdDays = new Map<string, string>();
  const createdDay = (task: DatedTask) => {
    let created = createdDays.get(task.id);
    if (created === undefined) {
      created = localDayOf(task.createdAt, tz);
      createdDays.set(task.id, created);
    }
    return created;
  };
  const createdBy = (task: DatedTask, day: string) => createdDay(task) <= day;
  const statusOn = (task: DatedTask, day: string) => statusAt(task.id, currentTaskStatus(task), day);
  const open = (task: DatedTask, day: string) => createdBy(task, day) && statusOn(task, day) !== "completado";
  return {
    open,
    overdue: (task, day) => open(task, day) && task.commitmentDate !== null && task.commitmentDate < day,
    blocked: (task, day) => createdBy(task, day) && statusOn(task, day) === "bloqueado",
    reviewDue: (task, day) =>
      open(task, day) &&
      task.reviewDate !== null &&
      task.reviewDate >= day &&
      task.reviewDate <= shiftIsoDate(day, REVIEW_WINDOW_DAYS - 1),
  };
}

/** The project existed and was `activo` at the end of the day. */
export function projectActiveOn(
  statusAt: StatusAt,
  project: Pick<ProjectListItem, "id" | "status" | "createdAt">,
  day: string,
  tz: string = TASK_TREND_TIME_ZONE,
): boolean {
  return localDayOf(project.createdAt, tz) <= day && statusAt(project.id, project.status, day) === "activo";
}

/** Distinct tasks completed in `[day − 6, day]`. */
export function completedInWeek(
  completions: { taskId: string; at: Date }[],
  day: string,
  tz: string = TASK_TREND_TIME_ZONE,
): number {
  const from = shiftIsoDate(day, -(COMPLETED_WINDOW_DAYS - 1));
  const ids = new Set<string>();
  for (const c of completions) {
    const d = localIsoDate(c.at, tz);
    if (d >= from && d <= day) ids.add(c.taskId);
  }
  return ids.size;
}

// ── Tramo grouping ──────────────────────────────────────────────────────────

/** Tramo group of a task: its workflow key, `admin` for admin tasks, else `sin-tramo`. */
export function taskTramoKey(task: Pick<TaskListItem, "kind" | "workflow">): string {
  if (task.workflow) return task.workflow.key;
  return task.kind === "admin" ? ADMIN_TRAMO_KEY : NO_TRAMO_KEY;
}

export function taskTramoLabel(task: Pick<TaskListItem, "kind" | "workflow">): string {
  if (task.workflow) return task.workflow.name;
  return task.kind === "admin" ? ADMIN_TRAMO_LABEL : NO_TRAMO_LABEL;
}

/** Tramo order (workflow sortOrder); no tramo, then admin, last. */
export function byTramoOrder(
  a: Pick<TaskListItem, "kind" | "workflow">,
  b: Pick<TaskListItem, "kind" | "workflow">,
): number {
  const rank = (t: Pick<TaskListItem, "kind" | "workflow">) =>
    t.workflow ? t.workflow.sortOrder : t.kind === "admin" ? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER - 1;
  return rank(a) - rank(b) || taskTramoLabel(a).localeCompare(taskTramoLabel(b), "es");
}

/**
 * KPI tramo split: each tramo's share (0–1, 3 decimals) of `items`, in first
 * seen order. Items without a tramo count in the total but get no segment.
 */
export function tramoSplit<T>(items: T[], tramoOf: (item: T) => TramoKey | null): { tramo: TramoKey; share: number }[] {
  if (items.length === 0) return [];
  const counts = new Map<TramoKey, number>();
  for (const item of items) {
    const tramo = tramoOf(item);
    if (tramo) counts.set(tramo, (counts.get(tramo) ?? 0) + 1);
  }
  return [...counts].map(([tramo, n]) => ({ tramo, share: Math.round((n / items.length) * 1000) / 1000 }));
}

// ── KPI context lines (frame `Dashboard`) ───────────────────────────────────

/** Context lines of the KPI cards when there is nothing to count. */
export const KPI_CONTEXT = {
  noActiveProjects: "Sin proyectos activos",
  noOverdue: "Nada vencido hoy",
  noBlocked: "Nada bloqueado hoy",
  noReview: "Próxima revisión sin agendar",
  noOpen: "Sin tareas abiertas",
} as const;

/** A tramo group of a KPI context line, ordered by `rank`, then label. */
export type KpiTramoGroup = { key: string; label: string; rank: number };

/** Tramo group of a task (as `byTramoOrder`): workflow order, no tramo, then admin. */
export function taskTramoGroup(task: Pick<TaskListItem, "kind" | "workflow">): KpiTramoGroup {
  return {
    key: taskTramoKey(task),
    label: taskTramoLabel(task),
    rank: task.workflow
      ? task.workflow.sortOrder
      : task.kind === "admin"
        ? Number.MAX_SAFE_INTEGER
        : Number.MAX_SAFE_INTEGER - 1,
  };
}

/** Tramo group of a project: its current workflow, else "Sin tramo" last. */
export function projectTramoGroup(project: Pick<ProjectListItem, "currentWorkflow">): KpiTramoGroup {
  const wf = project.currentWorkflow;
  return wf
    ? { key: wf.key, label: wf.name, rank: wf.sortOrder }
    : { key: NO_TRAMO_KEY, label: NO_TRAMO_LABEL, rank: Number.MAX_SAFE_INTEGER };
}

function tramoCounts<T>(items: T[], groupOf: (item: T) => KpiTramoGroup): (KpiTramoGroup & { count: number })[] {
  const groups = new Map<string, KpiTramoGroup & { count: number }>();
  for (const item of items) {
    const group = groupOf(item);
    const entry = groups.get(group.key) ?? { ...group, count: 0 };
    entry.count += 1;
    groups.set(group.key, entry);
  }
  return [...groups.values()].sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, "es"));
}

/** "Por área: Presale 2 · Diseño 1 · …" in tramo order; `empty` without items. */
export function tramoCountsLine<T>(items: T[], groupOf: (item: T) => KpiTramoGroup, empty: string): string {
  const counts = tramoCounts(items, groupOf);
  if (counts.length === 0) return empty;
  return `Por área: ${counts.map((g) => `${g.label} ${g.count}`).join(" · ")}`;
}

/**
 * "Construcción concentra 14 de 31": the tramo with the most items (ties go
 * to the first in tramo order); `empty` without items.
 */
export function tramoConcentrationLine<T>(items: T[], groupOf: (item: T) => KpiTramoGroup, empty: string): string {
  const counts = tramoCounts(items, groupOf);
  if (counts.length === 0) return empty;
  const top = counts.reduce((best, g) => (g.count > best.count ? g : best));
  return `${top.label} concentra ${top.count} de ${items.length}`;
}

const REVIEW_DATE_FORMAT = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * "Próxima revisión 12 nov" (or "hoy" / "mañana"): the earliest review date
 * from `today` on among `tasks`; "Próxima revisión sin agendar" without one.
 */
export function nextReviewLine(tasks: Pick<TaskListItem, "reviewDate">[], today: string): string {
  const next = tasks
    .map((t) => t.reviewDate)
    .filter((d): d is string => d !== null && d >= today)
    .sort()[0];
  if (!next) return KPI_CONTEXT.noReview;
  const days = isoDaysBetween(today, next);
  if (days === 0) return "Próxima revisión hoy";
  if (days === 1) return "Próxima revisión mañana";
  return `Próxima revisión ${REVIEW_DATE_FORMAT.format(Date.parse(`${next}T00:00:00Z`)).replace(/\.$/, "")}`;
}

/** Average age in days (creation → `today`, 1 decimal) of the tasks of each group. */
export function averageAgeByKey<T extends Pick<TaskListItem, "createdAt">>(
  tasks: T[],
  keyOf: (task: T) => string,
  today: string,
  tz: string = TASK_TREND_TIME_ZONE,
): Map<string, number> {
  const sums = new Map<string, { days: number; n: number }>();
  for (const task of tasks) {
    const key = keyOf(task);
    const entry = sums.get(key) ?? { days: 0, n: 0 };
    entry.days += Math.max(0, isoDaysBetween(localDayOf(task.createdAt, tz), today));
    entry.n += 1;
    sums.set(key, entry);
  }
  return new Map([...sums].map(([key, { days, n }]) => [key, Math.round((days / n) * 10) / 10]));
}

// ── Projects and people ─────────────────────────────────────────────────────

type ScopedTask = Pick<
  TaskListItem,
  "id" | "kind" | "title" | "projectId" | "managerId" | "status" | "customStatus" | "commitmentDate" | "createdAt"
> & { support?: { id: string }[] };

/**
 * Portfolio rows of the projects from the tasks the caller can see. There is
 * no plan source yet: `plan`, `deviation` and `budgetSpentPct` are null and
 * `real` is `projects.progress`. `nextDelivery` is the next open non-admin
 * task by commitment date (today or later).
 */
export function inicioPortfolioRows<T extends ScopedTask>(
  projects: Pick<ProjectListItem, "id" | "progress" | "endDate">[],
  tasks: T[],
  today: string,
  openOn: (task: T, day: string) => boolean,
): PortfolioRow[] {
  const byProject = new Map<string, T[]>();
  for (const task of tasks) {
    const list = byProject.get(task.projectId) ?? [];
    list.push(task);
    byProject.set(task.projectId, list);
  }
  const last7 = Array.from({ length: 7 }, (_, i) => shiftIsoDate(today, i - 6));
  return projects.map((project) => {
    const own = byProject.get(project.id) ?? [];
    const open = own.filter((t) => !isTaskClosed(t));
    const next = open
      .filter((t) => t.kind !== "admin" && t.commitmentDate !== null && t.commitmentDate >= today)
      .sort((a, b) => a.commitmentDate!.localeCompare(b.commitmentDate!) || a.title.localeCompare(b.title, "es"))[0];
    return {
      projectId: project.id,
      real: project.progress,
      plan: null,
      deviation: null,
      budgetSpentPct: null,
      open: open.length,
      overdue: open.filter((t) => t.commitmentDate !== null && t.commitmentDate < today).length,
      daysToDelivery: project.endDate ? isoDaysBetween(today, project.endDate) : null,
      nextDelivery: next ? { title: next.title, date: next.commitmentDate! } : null,
      series7: last7.map((day) => own.filter((t) => openOn(t, day)).length),
    };
  });
}

/**
 * Workload rows: every active staff member responsible for at least one open
 * task the caller can see, most open first. `occupancyPct` = open / capacity
 * × 100 (capacity 0 → 0). Hours and availability are not part of Inicio.
 */
export function inicioWorkloadRows(
  staff: Pick<Staff, "id" | "name" | "capacity">[],
  tasks: ScopedTask[],
  today: string,
): PeopleOverviewRow[] {
  const known = new Map(staff.map((s) => [s.id, s]));
  const byStaff = new Map<string, ScopedTask[]>();
  for (const task of tasks) {
    if (!task.managerId || !known.has(task.managerId) || isTaskClosed(task)) continue;
    const list = byStaff.get(task.managerId) ?? [];
    list.push(task);
    byStaff.set(task.managerId, list);
  }
  return [...byStaff]
    .map(([staffId, own]) => {
      const capacity = known.get(staffId)!.capacity;
      return {
        staffId,
        open: own.length,
        overdue: own.filter((t) => t.commitmentDate !== null && t.commitmentDate < today).length,
        activeProjects: new Set(own.map((t) => t.projectId)).size,
        occupancyPct: capacity > 0 ? Math.round((own.length / capacity) * 100) : 0,
        weekHours: null,
        availability: [],
      };
    })
    .sort(
      (a, b) =>
        b.open - a.open ||
        b.overdue - a.overdue ||
        known.get(a.staffId)!.name.localeCompare(known.get(b.staffId)!.name, "es"),
    );
}

/** The caller is the task's responsable or in its support. */
export function involves(task: { managerId: string | null; support?: { id: string }[] }, staffId: string): boolean {
  return task.managerId === staffId || (task.support ?? []).some((s) => s.id === staffId);
}

// ── Mi día ──────────────────────────────────────────────────────────────────

/**
 * Sort key of an agenda start: instants with a zone (`…Z`, `±hh:mm`) are
 * moved to local `YYYY-MM-DDTHH:mm`; local strings are kept.
 */
export function agendaSortKey(start: string, tz: string = TASK_TREND_TIME_ZONE): string {
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(start)) return start;
  const at = new Date(start);
  if (Number.isNaN(at.getTime())) return start;
  return zonedIsoMinute(at, tz);
}

/**
 * Mi día: the task agenda items that start on `day` plus the reminders of
 * the day (already that day), without duplicates, by local start time.
 */
export function myDayItems(
  taskItems: AgendaItem[],
  reminderItems: AgendaItem[],
  day: string,
  tz: string = TASK_TREND_TIME_ZONE,
): AgendaItem[] {
  const seen = new Set<string>();
  const items: AgendaItem[] = [];
  for (const item of [...taskItems.filter((i) => agendaSortKey(i.start, tz).slice(0, 10) === day), ...reminderItems]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items.sort(
    (a, b) => agendaSortKey(a.start, tz).localeCompare(agendaSortKey(b.start, tz)) || a.title.localeCompare(b.title, "es"),
  );
}
