/**
 * Pure rules of the Personas aggregates (redesign BE §7.11): the Mon–Fri week,
 * availability per day, occupancy and the order of a person's open tasks.
 * No I/O; `lib/actions/people-actions.ts` feeds it rows.
 */
import type { Availability, AttentionItem, Tone } from "@/lib/types/widgets";

/** ISO date (`YYYY-MM-DD`) of `now` in `timeZone`. */
export function localIsoDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
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

/** The most frequent tramo among the tasks (ties: first seen), null when none has one. */
export function dominantTramo(keys: Array<string | null>): string | null {
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
  tramo: string | null;
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
      tramo: task.tramo,
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
