/**
 * Pure rules of the Personas aggregates (redesign BE §7.11): the Mon–Fri week,
 * availability per day, occupancy and the order of a person's open tasks.
 * No I/O; `lib/actions/people-actions.ts` feeds it rows.
 */
import { zonedIsoDate } from "@/lib/dates/zoned-formatters";
import type { WeekLoad } from "@/lib/types/redesign";
import type { Availability, AttentionItem, Tone } from "@/lib/types/widgets";

/** ISO date (`YYYY-MM-DD`) of `now` in `timeZone`. */
export function localIsoDate(now: Date, timeZone: string): string {
  return zonedIsoDate(now, timeZone);
}

function parseIso(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `date` plus `days` calendar days (ISO in, ISO out). */
export function addIsoDays(date: string, days: number): string {
  const d = parseIso(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);
}

/** Monday to Friday of the week that contains `today`. */
export function workWeek(today: string): string[] {
  const weekday = parseIso(today).getUTCDay(); // 0 = Sunday
  const monday = addIsoDays(today, weekday === 0 ? -6 : 1 - weekday);
  return [0, 1, 2, 3, 4].map((offset) => addIsoDays(monday, offset));
}

/** The 4 ISO Mondays from the week that contains `today`, this week first. */
export function fourWeeks(today: string): string[] {
  const monday = workWeek(today)[0]!;
  return [0, 7, 14, 21].map((offset) => addIsoDays(monday, offset));
}

/**
 * Load of the 4 weeks of `fourWeeks(today)`. Week 1 counts overdue, undated
 * and due this week (through Sunday); weeks 2–4 count the tasks due in that
 * week (Monday–Sunday). `absentDays` are the Mon–Fri days inside an absence;
 * they lower that week's capacity: `capacity × (5 − absentDays) ÷ 5`, and a
 * week with no capacity left (or capacity 0) is 0 %.
 */
export function weekLoads(input: {
  today: string;
  capacity: number;
  dueDates: (string | null)[];
  absences: { from: string; to: string }[];
}): WeekLoad[] {
  const mondays = fourWeeks(input.today);
  return mondays.map((monday, index) => {
    const sunday = addIsoDays(monday, 6);
    const open = input.dueDates.filter((due) =>
      index === 0 ? due === null || due <= sunday : due !== null && due >= monday && due <= sunday,
    ).length;
    const absentDays = [0, 1, 2, 3, 4]
      .map((offset) => addIsoDays(monday, offset))
      .filter((day) => input.absences.some((a) => a.from <= day && day <= a.to)).length;
    const effective = (input.capacity * (5 - absentDays)) / 5;
    return { weekStart: monday, open, occupancyPct: occupancyPct(open, effective), absentDays };
  });
}

/**
 * One day's availability from the open tasks due that day and the person's
 * weekly capacity: the daily share is `capacity / 5`; ≤ 60 % libre,
 * ≤ 100 % ocupado, > 100 % saturado. With capacity 0 any task due that day
 * is over capacity (saturado); no task is libre.
 */
export function dayAvailability(dueCount: number, capacity: number, onVacation: boolean): Availability {
  if (onVacation) return "vacaciones";
  if (dueCount <= 0) return "libre";
  const daily = capacity / 5;
  if (daily <= 0) return "saturado";
  const pct = (dueCount / daily) * 100;
  if (pct <= 60) return "libre";
  if (pct <= 100) return "ocupado";
  return "saturado";
}

/** Mon–Fri availability: `vacaciones` on approved absence days, else by tasks due that day. */
export function weekAvailability(input: {
  days: string[];
  capacity: number;
  dueDates: Array<string | null>;
  absences: Array<{ from: string; to: string }>;
}): Availability[] {
  const dueByDay = new Map<string, number>();
  for (const due of input.dueDates) {
    if (due) dueByDay.set(due, (dueByDay.get(due) ?? 0) + 1);
  }
  return input.days.map((day) =>
    dayAvailability(
      dueByDay.get(day) ?? 0,
      input.capacity,
      input.absences.some((a) => a.from <= day && day <= a.to)
    )
  );
}

/** `open / capacity × 100`, rounded; capacity 0 gives 0. */
export function occupancyPct(open: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.round((open / capacity) * 100);
}

/** Up to two initials of a name ("Ana María López" → "AL"). */
export function initialsOf(name: string, lastName?: string | null): string {
  const words = `${name} ${lastName ?? ""}`.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** Full display name: name plus last name when present. */
export function displayName(name: string, lastName?: string | null): string {
  return [name, lastName].filter((part) => part && part.trim()).join(" ");
}

/** The most frequent etapa among the tasks (ties: first seen), null when none has one. */
export function dominantEtapa(keys: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  for (const key of keys) {
    if (!key) continue;
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (best === null || n > (counts.get(best) ?? 0)) best = key;
  }
  return best;
}

export type OpenTaskRow = {
  id: string;
  title: string;
  projectName: string;
  etapa: string | null;
  status: string;
  due: string | null;
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function shortDate(date: string): string {
  const d = parseIso(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Reason pill and tone of one open task relative to `today`. */
export function taskReason(task: Pick<OpenTaskRow, "status" | "due">, today: string): {
  reason: string;
  tone: Tone;
  daysLate: number | null;
} {
  if (task.due && task.due < today) {
    const late = daysBetween(task.due, today);
    return { reason: late === 1 ? "Vencida hace 1 día" : `Vencida hace ${late} días`, tone: "critical", daysLate: late };
  }
  if (task.status === "bloqueado") return { reason: "Bloqueada", tone: "warn", daysLate: null };
  if (task.due === today) return { reason: "Vence hoy", tone: "warn", daysLate: null };
  if (task.due) return { reason: `Vence ${shortDate(task.due)}`, tone: "default", daysLate: null };
  return { reason: "Sin fecha", tone: "default", daysLate: null };
}

/**
 * A person's open tasks as attention items: overdue first (most late first),
 * then by due date (undated last), then by title.
 */
export function toAttentionItems(
  tasks: OpenTaskRow[],
  today: string,
  assignee: AttentionItem["assignee"]
): AttentionItem[] {
  const sorted = [...tasks].sort((a, b) => {
    const aLate = a.due !== null && a.due < today;
    const bLate = b.due !== null && b.due < today;
    if (aLate !== bLate) return aLate ? -1 : 1;
    if (a.due !== b.due) {
      if (a.due === null) return 1;
      if (b.due === null) return -1;
      return a.due < b.due ? -1 : 1;
    }
    return a.title.localeCompare(b.title, "es");
  });
  return sorted.map((task) => {
    const { reason, tone, daysLate } = taskReason(task, today);
    return {
      id: task.id,
      title: task.title,
      href: `/tareas?tarea=${task.id}`,
      project: task.projectName,
      etapa: task.etapa,
      reason,
      tone,
      assignee,
      due: task.due,
      daysLate,
    };
  });
}

/** Counts of open and overdue tasks relative to `today`. */
export function openCounts(dueDates: Array<string | null>, today: string): { open: number; overdue: number } {
  return {
    open: dueDates.length,
    overdue: dueDates.filter((due) => due !== null && due < today).length,
  };
}

/**
 * Index (0–3) of the load week a task counts in, from the 4 ISO Mondays
 * (`fourWeeks`): week 1 takes overdue, undated and due-this-week tasks, weeks
 * 2–4 the tasks due in that week; a task due after week 4 counts in none (-1).
 */
export function loadWeekIndex(due: string | null, mondays: readonly string[]): number {
  if (due === null || mondays.length === 0) return 0;
  for (let i = mondays.length - 1; i >= 1; i--) {
    if (due >= mondays[i]! && due <= addIsoDays(mondays[i]!, 6)) return i;
  }
  return due < (mondays[1] ?? addIsoDays(mondays[0]!, 7)) ? 0 : -1;
}

export type ProjectTaskRow = { projectId: string; projectName: string; etapa: string | null; due: string | null };

export type ProjectLoad = {
  projectId: string;
  name: string;
  etapa: string | null;
  open: number;
  overdue: number;
  weeks: [number, number, number, number];
};

/**
 * A person's open tasks grouped per project (Personas Analítico): open,
 * overdue (`due < today`) and open tasks per load week (`loadWeekIndex`). The
 * project etapa is the most frequent task etapa. Sorted overdue desc, open
 * desc, then name.
 */
export function projectLoads(tasks: readonly ProjectTaskRow[], today: string, mondays: readonly string[]): ProjectLoad[] {
  const byProject = new Map<string, ProjectLoad & { etapas: Array<string | null> }>();
  for (const task of tasks) {
    let entry = byProject.get(task.projectId);
    if (!entry) {
      entry = { projectId: task.projectId, name: task.projectName, etapa: null, open: 0, overdue: 0, weeks: [0, 0, 0, 0], etapas: [] };
      byProject.set(task.projectId, entry);
    }
    entry.open += 1;
    if (task.due !== null && task.due < today) entry.overdue += 1;
    const week = loadWeekIndex(task.due, mondays);
    if (week >= 0 && week < 4) entry.weeks[week] += 1;
    entry.etapas.push(task.etapa);
  }
  return [...byProject.values()]
    .map(({ etapas, ...load }) => ({ ...load, etapa: dominantEtapa(etapas) }))
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name, "es"));
}

/**
 * Per staff id: whether the person shares at least one active project with
 * the viewer. The viewer's own row is true; when the viewer has no entry (not
 * in the listed team), everyone is false.
 */
export function sharesProjectWithViewer(
  projectsByStaff: ReadonlyMap<string, ReadonlyArray<{ projectId: string }>>,
  viewerId: string,
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const viewerProjects = projectsByStaff.get(viewerId);
  const viewerSet = new Set((viewerProjects ?? []).map((p) => p.projectId));
  for (const [staffId, list] of projectsByStaff) {
    if (!viewerProjects) out.set(staffId, false);
    else if (staffId === viewerId) out.set(staffId, true);
    else out.set(staffId, list.some((p) => viewerSet.has(p.projectId)));
  }
  return out;
}
