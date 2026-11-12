/** Weekly planner (BE §10.4). Pure, deterministic and client-safe. */
import { localDate } from "@/lib/time-tracking/local-time";
import type { DeferredItem } from "@/lib/types/calendario";
import type { TaskPriority } from "@/lib/types/core";

export type PlanWeekPerson = {
  staffId: string;
  name: string;
  workday: number;
  absent: string[];
  /** Hours already planned per day. */
  booked: Record<string, number>;
};

export type PlanWeekBacklogTask = {
  taskId: string;
  title: string;
  hours: number;
  priority: TaskPriority;
  managerId: string | null;
  deadline: string | null;
  dependsOn: string[];
  projectId: string | null;
};

export type PlanWeekCell = { staffId: string; date: string; before: number; after: number; workday: number };

export type PlanWeekInput = {
  weekStart: string;
  /** Mon–Fri workdays. */
  days: string[];
  people: PlanWeekPerson[];
  backlog: PlanWeekBacklogTask[];
  now: string;
  /** Dependencies outside the backlog (open ones), by task id: a missing date blocks the task. */
  externalDeps?: Record<string, { title: string; date: string | null }>;
};

export type PlanWeekResult = {
  placements: { taskId: string; staffId: string; date: string }[];
  deferred: DeferredItem[];
  cells: PlanWeekCell[];
};

export const PLAN_WEEK_REASONS = {
  deadline: "Vence antes de que haya espacio",
  noOwner: "Sin responsable",
  full: (name: string) => `${name} ya está al 100 %`,
  vacation: (name: string) => `${name} está de vacaciones`,
  dependency: (title: string) => `Depende de ${title}, que aún no tiene fecha`,
} as const;

const PRIORITY_RANK: Record<TaskPriority, number> = { alta: 0, media: 1, baja: 2 };
const EPS = 1e-6;

const round2 = (n: number) => Math.round(n * 100) / 100;

function compareTasks(a: PlanWeekBacklogTask, b: PlanWeekBacklogTask): number {
  if (a.deadline !== b.deadline) {
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline < b.deadline ? -1 : 1;
  }
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;
  if (a.hours !== b.hours) return b.hours - a.hours;
  return a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0;
}

/**
 * Order of placement: deadline asc (nulls last), priority (alta, media, baja),
 * hours desc, id; dependencies inside the backlog always come first. Tasks in a
 * dependency cycle come last, in the same order.
 */
export function orderBacklog<T extends PlanWeekBacklogTask>(backlog: T[]): T[] {
  const ids = new Set(backlog.map((t) => t.taskId));
  const remaining = [...backlog].sort(compareTasks);
  const emitted = new Set<string>();
  const out: T[] = [];
  while (remaining.length > 0) {
    const index = remaining.findIndex((t) => t.dependsOn.every((d) => d === t.taskId || !ids.has(d) || emitted.has(d)));
    const [next] = remaining.splice(index === -1 ? 0 : index, 1);
    emitted.add(next.taskId);
    out.push(next);
  }
  return out;
}

function todayOf(now: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(now) ? now : localDate(new Date(now));
}

export function planWeek(input: PlanWeekInput): PlanWeekResult {
  const today = todayOf(input.now);
  const days = [...input.days].sort();
  const people = new Map(input.people.map((p) => [p.staffId, p]));
  const titles = new Map(input.backlog.map((t) => [t.taskId, t.title]));

  const placed = new Map<string, Record<string, number>>();
  for (const p of input.people) placed.set(p.staffId, {});
  const placedDate = new Map<string, string>();

  const placements: PlanWeekResult["placements"] = [];
  const deferred: DeferredItem[] = [];
  const defer = (task: PlanWeekBacklogTask, reason: string) => {
    deferred.push({ taskId: task.taskId, title: task.title, reason });
  };

  const hoursOn = (person: PlanWeekPerson, date: string) =>
    (person.booked[date] ?? 0) + (placed.get(person.staffId)?.[date] ?? 0);
  const workdayOn = (person: PlanWeekPerson, date: string) => (person.absent.includes(date) ? 0 : person.workday);

  for (const task of orderBacklog(input.backlog)) {
    const person = task.managerId ? people.get(task.managerId) : undefined;
    if (!person) {
      defer(task, PLAN_WEEK_REASONS.noOwner);
      continue;
    }

    // A dependency without a date blocks the task; a dated one sets the earliest day.
    let minDate = today;
    let blockedBy: string | null = null;
    for (const depId of [...task.dependsOn].sort()) {
      if (depId === task.taskId) continue;
      const ownTitle = titles.get(depId);
      if (ownTitle !== undefined) {
        const date = placedDate.get(depId);
        if (!date) blockedBy ??= ownTitle;
        else if (date > minDate) minDate = date;
        continue;
      }
      const ext = input.externalDeps?.[depId];
      if (!ext) continue;
      if (ext.date === null) blockedBy ??= ext.title;
      else if (ext.date > minDate) minDate = ext.date;
    }
    if (blockedBy !== null) {
      defer(task, PLAN_WEEK_REASONS.dependency(blockedBy));
      continue;
    }

    const open = days.filter((d) => d >= today && workdayOn(person, d) > 0);
    if (open.length === 0) {
      defer(task, PLAN_WEEK_REASONS.vacation(person.name));
      continue;
    }
    const roomy = open.filter((d) => d >= minDate && hoursOn(person, d) + task.hours <= workdayOn(person, d) + EPS);
    const date = roomy.find((d) => task.deadline === null || d <= task.deadline);
    if (!date) {
      defer(task, roomy.length > 0 ? PLAN_WEEK_REASONS.deadline : PLAN_WEEK_REASONS.full(person.name));
      continue;
    }

    const lane = placed.get(person.staffId)!;
    lane[date] = round2((lane[date] ?? 0) + task.hours);
    placedDate.set(task.taskId, date);
    placements.push({ taskId: task.taskId, staffId: person.staffId, date });
  }

  const cells: PlanWeekCell[] = [];
  for (const person of input.people) {
    for (const date of days) {
      const before = round2(person.booked[date] ?? 0);
      cells.push({
        staffId: person.staffId,
        date,
        before,
        after: round2(before + (placed.get(person.staffId)?.[date] ?? 0)),
        workday: workdayOn(person, date),
      });
    }
  }
  return { placements, deferred, cells };
}

/**
 * The cells after a set of placements (what the board draws while a
 * `planear_semana` proposal is open). `hours` is the effective hours per task.
 */
export function cellsAfterPlacements(
  cells: PlanWeekCell[],
  placements: { taskId: string; staffId: string; date: string }[],
  hours: Record<string, number>,
): PlanWeekCell[] {
  const added = new Map<string, number>();
  for (const p of placements) {
    const key = `${p.staffId}|${p.date}`;
    added.set(key, (added.get(key) ?? 0) + (hours[p.taskId] ?? 0));
  }
  return cells.map((c) => ({ ...c, after: round2(c.before + (added.get(`${c.staffId}|${c.date}`) ?? 0)) }));
}
