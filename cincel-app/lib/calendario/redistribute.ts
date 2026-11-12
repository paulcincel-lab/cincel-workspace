/**
 * Redistribution of an overloaded day (BE §10.3). Pure and client-safe.
 *
 * Deterministic: every sort is stable and ends on the task id. Meetings never
 * move here; only the tasks of the day are candidates.
 */
import type { DayLoad, DeferredItem } from "@/lib/types/calendario";
import type { TaskPriority } from "@/lib/types/core";

export type RedistributeTask = {
  taskId: string;
  /** Shown in `deferred`; the tool layer fills it from the task row. */
  title?: string;
  hours: number;
  priority: TaskPriority;
  blocked: boolean;
  fixed: boolean;
  dependsOn: string[];
  dependents: { taskId: string; date: string }[];
};

export type RedistributeInput = {
  staffId: string;
  date: string;
  target: "spread" | "next_day";
  /** Default 5 workdays. */
  horizonDays: number;
  load: DayLoad[];
  tasks: RedistributeTask[];
  workDays: number[];
  absences: string[];
  today: string;
};

export type RedistributeMove = { taskId: string; from: string; to: string; reason: string };
export type RedistributeResult = { moves: RedistributeMove[]; deferred: DeferredItem[] };

export const DEFAULT_HORIZON_DAYS = 5;

/** Priority rank used for "lowest first": baja < media < alta. */
const PRIORITY_RANK: Record<TaskPriority, number> = { baja: 0, media: 1, alta: 2 };

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Hours as copy: 6 → "6", 1.5 → "1,5". */
export function formatHours(hours: number): string {
  return String(round2(hours)).replace(".", ",");
}

/** Rounds away floating point noise so `6.000000001 <= 6` holds. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The next `count` workdays after `date`, skipping days off and absences. */
function workdaysAfter(date: string, count: number, workDays: Set<number>, absences: Set<string>): string[] {
  const out: string[] = [];
  let cursor = date;
  for (let i = 0; i < 366 && out.length < count; i += 1) {
    cursor = addDays(cursor, 1);
    if (!workDays.has(weekdayOf(cursor))) continue;
    if (absences.has(cursor)) continue;
    out.push(cursor);
  }
  return out;
}

/** Before and after hours of every day touched by `moves`, for the meters of the proposal. */
export function loadAfterMoves(
  load: DayLoad[],
  moves: RedistributeMove[],
  hoursOf: Record<string, number>,
): { date: string; before: number; after: number; workday: number }[] {
  const byDate = new Map<string, DayLoad>();
  for (const row of load) byDate.set(row.date, row);
  const dates = new Set<string>();
  for (const move of moves) {
    dates.add(move.from);
    dates.add(move.to);
  }
  const fallbackWorkday = load.length > 0 ? load[0].workday : 0;
  return [...dates].sort().map((date) => {
    const row = byDate.get(date);
    const before = row?.hours ?? 0;
    let after = before;
    for (const move of moves) {
      const h = hoursOf[move.taskId] ?? 0;
      if (move.from === date) after -= h;
      if (move.to === date) after += h;
    }
    return { date, before: round2(before), after: round2(after), workday: row?.workday ?? fallbackWorkday };
  });
}

export function proposeRedistribution(input: RedistributeInput): RedistributeResult {
  const workDays = new Set(input.workDays);
  const absences = new Set(input.absences);
  const horizon = input.target === "next_day" ? 1 : Math.max(1, input.horizonDays || DEFAULT_HORIZON_DAYS);

  const loadByDate = new Map<string, DayLoad>();
  for (const row of input.load) {
    if (row.staffId === input.staffId) loadByDate.set(row.date, row);
  }
  const baseWorkday = loadByDate.get(input.date)?.workday ?? input.load.find((row) => row.staffId === input.staffId)?.workday ?? 0;
  const workdayOf = (date: string) => loadByDate.get(date)?.workday ?? baseWorkday;
  /** Working copy of the hours per day; every move updates it. */
  const hours = new Map<string, number>();
  const hoursOn = (date: string) => hours.get(date) ?? loadByDate.get(date)?.hours ?? 0;

  const moves: RedistributeMove[] = [];
  const deferred: DeferredItem[] = [];

  let overload = round2(hoursOn(input.date) - baseWorkday);
  if (overload <= 0 || baseWorkday <= 0 || input.tasks.length === 0) return { moves, deferred };

  const candidates = [...input.tasks].sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    if (a.hours !== b.hours) return b.hours - a.hours;
    return a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0;
  });

  const targets = workdaysAfter(input.date, horizon, workDays, absences);
  const newDate = new Map<string, string>();

  for (const task of candidates) {
    if (overload <= 0) break;
    const title = task.title ?? "";
    if (task.fixed) {
      deferred.push({ taskId: task.taskId, title, reason: "Tiene fecha de entrega ese día" });
      continue;
    }

    // Window allowed by dependencies: not before a moved dependency, not after a dependent.
    let notBefore = input.date;
    for (const id of task.dependsOn) {
      const moved = newDate.get(id);
      if (moved && moved > notBefore) notBefore = moved;
    }
    let notAfter: string | null = null;
    for (const dep of task.dependents) {
      const when = newDate.get(dep.taskId) ?? dep.date;
      if (notAfter === null || when < notAfter) notAfter = when;
    }

    const options = targets.filter((date) => date >= notBefore && (notAfter === null || date <= notAfter));
    if (options.length === 0) {
      deferred.push({
        taskId: task.taskId,
        title,
        reason: notAfter !== null && notAfter <= input.date ? "Otra tarea depende de ella ese día" : "No cabe sin pasar a otra tarea que depende de ella",
      });
      continue;
    }

    // `options` is in date order: the earliest day with room wins.
    const chosen = options.find((date) => round2(hoursOn(date) + task.hours) <= workdayOf(date));
    if (!chosen) {
      deferred.push({
        taskId: task.taskId,
        title,
        reason: input.target === "next_day" ? "No cabe mañana" : `Sin espacio en los próximos ${horizon} días hábiles`,
      });
      continue;
    }

    const before = hoursOn(input.date);
    hours.set(input.date, round2(before - task.hours));
    hours.set(chosen, round2(hoursOn(chosen) + task.hours));
    overload = round2(hoursOn(input.date) - baseWorkday);
    newDate.set(task.taskId, chosen);
    moves.push({
      taskId: task.taskId,
      from: input.date,
      to: chosen,
      reason: task.blocked
        ? "Está bloqueada y no avanza ese día"
        : `Libera ${formatHours(task.hours)} h de un día de ${formatHours(before)} h`,
    });
  }

  return { moves, deferred };
}
