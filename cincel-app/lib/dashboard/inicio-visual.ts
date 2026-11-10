/**
 * Inicio Visual data (#989): pure helpers `loadInicio` composes for the
 * greeting hero, the open shifts, the project teams, the
 * "Horas esta semana" KPI and the attention progress. Dates are calendar
 * dates in the app's time zone, as `YYYY-MM-DD` strings.
 */
import { isoDaysBetween, shiftIsoDate } from "@/lib/dashboard/inicio";
import { deltaTone, DELTA_CAPTION, DELTA_UNCHANGED } from "@/lib/metrics/series";
import { initialsOf } from "@/lib/inicio/header";
import { isTaskCompleted } from "@/lib/tasks/status-options";
import type { DayHours, InicioHero, InicioOpenShifts } from "@/lib/types/redesign";
import type { TaskListItem } from "@/lib/types/core";
import type { KpiDatum, TramoKey } from "@/lib/types/widgets";

type HeroTask = Pick<TaskListItem, "commitmentDate" | "projectId" | "project">;

/** `/proyectos/<id>`. */
export function inicioProjectHref(id: string): string {
  return `/proyectos/${encodeURIComponent(id)}`;
}

/**
 * Hero counts. `dueToday` = open tasks with `commitmentDate === today`;
 * `overdue` = the overdue tasks; `overdueProjects` = their distinct projects;
 * `focusProject` = the project with the most overdue tasks, ties going to the
 * one with the most days late (then the name), null without overdue tasks.
 */
export function inicioHero(openTasks: HeroTask[], overdueTasks: HeroTask[], today: string): InicioHero {
  const byProject = new Map<string, { id: string; name: string; count: number; maxLate: number }>();
  for (const task of overdueTasks) {
    const late = task.commitmentDate ? Math.max(0, isoDaysBetween(task.commitmentDate, today)) : 0;
    const entry = byProject.get(task.projectId) ?? { id: task.projectId, name: task.project.name, count: 0, maxLate: 0 };
    entry.count += 1;
    entry.maxLate = Math.max(entry.maxLate, late);
    byProject.set(task.projectId, entry);
  }
  const focus = [...byProject.values()].sort(
    (a, b) => b.count - a.count || b.maxLate - a.maxLate || a.name.localeCompare(b.name, "es"),
  )[0];
  return {
    dueToday: openTasks.filter((t) => t.commitmentDate === today).length,
    overdue: overdueTasks.length,
    overdueProjects: byProject.size,
    focusProject: focus ? { id: focus.id, name: focus.name, href: inicioProjectHref(focus.id) } : null,
  };
}

/**
 * Each staff member's tramo: the tramo of most of the open tasks they are
 * involved in (manager or support), ties by tramo key; absent = no tramo.
 */
export function dominantTramoByStaff(
  tasks: Pick<TaskListItem, "managerId" | "support" | "workflow">[],
): Map<string, TramoKey> {
  const counts = new Map<string, Map<TramoKey, number>>();
  for (const task of tasks) {
    const key = task.workflow?.key;
    if (!key) continue;
    const people = new Set([task.managerId, ...(task.support ?? []).map((s) => s.id)].filter((id): id is string => !!id));
    for (const id of people) {
      const own = counts.get(id) ?? new Map<TramoKey, number>();
      own.set(key, (own.get(key) ?? 0) + 1);
      counts.set(id, own);
    }
  }
  const out = new Map<string, TramoKey>();
  for (const [id, own] of counts) {
    const best = [...own.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (best) out.set(id, best[0]);
  }
  return out;
}

/**
 * The staff of the dashboard scope: everyone active for `global`, else the
 * people on the scoped tasks (manager, support) and projects (manager,
 * coordinator) plus the viewer.
 */
export function scopedStaffIds(
  scope: "global" | "managed_projects" | "assigned_tasks",
  input: {
    viewerId: string;
    staff: { id: string; active: boolean }[];
    tasks: Pick<TaskListItem, "managerId" | "support">[];
    projects: { manager: { id: string } | null; coordinator: { id: string } | null }[];
  },
): string[] {
  const active = new Set(input.staff.filter((s) => s.active).map((s) => s.id));
  if (scope === "global") return [...active];
  const ids = new Set<string>([input.viewerId]);
  for (const task of input.tasks) {
    if (task.managerId) ids.add(task.managerId);
    for (const s of task.support ?? []) ids.add(s.id);
  }
  for (const project of input.projects) {
    if (project.manager) ids.add(project.manager.id);
    if (project.coordinator) ids.add(project.coordinator.id);
  }
  return [...ids].filter((id) => active.has(id) || id === input.viewerId);
}

/** Open shifts of today: the given staff ids (distinct, in scope) with their initials and tramo. */
export function openShiftsOf(
  openStaffIds: string[],
  inScope: ReadonlySet<string>,
  staffById: ReadonlyMap<string, { name: string; lastName: string | null }>,
  tramoByStaff: ReadonlyMap<string, TramoKey>,
): InicioOpenShifts {
  const ids = [...new Set(openStaffIds)].filter((id) => inScope.has(id) && staffById.has(id));
  const people = ids
    .map((id) => {
      const s = staffById.get(id)!;
      const name = [s.name, s.lastName].filter((part) => part && part.trim()).join(" ");
      return { id, name, initials: initialsOf(name), tramo: tramoByStaff.get(id) ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map(({ id, initials, tramo }) => ({ id, initials, tramo }));
  return { count: people.length, people };
}

/** A project's team: manager, coordinator, then the task assignees, deduplicated. */
export function projectTeam(
  project: { manager: { id: string; name: string } | null; coordinator: { id: string; name: string } | null },
  tasks: Pick<TaskListItem, "manager" | "support">[],
  tramoByStaff: ReadonlyMap<string, TramoKey>,
): { id: string; initials: string; tramo: TramoKey | null }[] {
  const people = new Map<string, string>();
  const add = (p: { id: string; name: string } | null | undefined) => {
    if (p && !people.has(p.id)) people.set(p.id, p.name);
  };
  add(project.manager);
  add(project.coordinator);
  for (const task of tasks) {
    add(task.manager);
    for (const s of task.support ?? []) add(s);
  }
  return [...people.entries()].map(([id, name]) => ({ id, initials: initialsOf(name), tramo: tramoByStaff.get(id) ?? null }));
}

/** Subtask progress of an attention item: done / total (null without subtareas) and the % (`taskProgressPct`). */
export function attentionProgress(
  task: Pick<TaskListItem, "subtaskCount" | "subtaskDoneCount" | "status" | "customStatus">,
): { subtasks: { done: number; total: number } | null; progressPct: number } {
  const total = task.subtaskCount ?? 0;
  const done = Math.min(task.subtaskDoneCount ?? 0, total);
  const progressPct = isTaskCompleted(task) ? 100 : total > 0 ? Math.round((done / total) * 100) : 0;
  return { subtasks: total > 0 ? { done, total } : null, progressPct };
}

const hoursFormat = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/** "126 h". */
export function formatHours(value: number): string {
  return `${hoursFormat.format(value)} h`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Daily totals of a `weekHours` result, summed over every staff member. */
export function dailyTotals(weeks: Iterable<{ days: DayHours[] }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const week of weeks) for (const day of week.days) out.set(day.date, (out.get(day.date) ?? 0) + day.hours);
  return out;
}

/**
 * "Horas esta semana": this week's total hours (summed over the staff),
 * compared with last week's total (up is good), `series7` = the daily totals
 * of the 7 days ending today, `display` "126 h".
 */
export function horasSemanaKpi(input: {
  key: string;
  label: string;
  href?: string;
  thisWeek: Iterable<{ days: DayHours[]; total: number }>;
  lastWeek: Iterable<{ days: DayHours[]; total: number }>;
  today: string;
}): KpiDatum {
  const thisList = [...input.thisWeek];
  const lastList = [...input.lastWeek];
  const value = round1(thisList.reduce((sum, w) => sum + w.total, 0));
  const previous = round1(lastList.reduce((sum, w) => sum + w.total, 0));
  const change = round1(value - previous);
  const daily = dailyTotals([...thisList, ...lastList]);
  const series7 = Array.from({ length: 7 }, (_, i) => round1(daily.get(shiftIsoDate(input.today, i - 6)) ?? 0));
  const kpi: KpiDatum = {
    key: input.key,
    label: input.label,
    value,
    display: formatHours(value),
    series7,
    delta: {
      value: change,
      good: change >= 0,
      caption: DELTA_CAPTION,
      label: change === 0 ? DELTA_UNCHANGED : `${change > 0 ? "+" : "−"}${formatHours(Math.abs(change))} vs. semana`,
      tone: deltaTone(change, "up"),
    },
    caption: `${formatHours(previous)} la semana pasada`,
  };
  if (input.href) kpi.href = input.href;
  return kpi;
}
