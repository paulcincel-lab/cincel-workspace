import type { PlanWeekData, Proposal } from "@/lib/types/calendario";

/** Pure helpers of the Planear mi semana board (FE §7.7). Client-safe. */

export const DEFAULT_PLAN_TASK_HOURS = 1;
export const DEFAULT_PLAN_WORKDAY = 6;

export type PlanBacklogTask = PlanWeekData["backlog"][number];
export type PlanPerson = PlanWeekData["people"][number];
export type PlanCell = PlanWeekData["cells"][number];
export type PlanLoadTone = "space" | "full" | "over";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAYS_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** The ISO dates Lun–Vie of the week that starts on `weekStart`. */
export function weekDays(weekStart: string): string[] {
  const start = parse(weekStart);
  return Array.from({ length: 5 }, (_, i) => new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

/** `data.days` when the loader sent them, else Lun–Vie of `weekStart`. */
export function daysOf(data: Pick<PlanWeekData, "days" | "weekStart">): string[] {
  return data.days.length > 0 ? data.days : weekDays(data.weekStart);
}

/** "Lun" . */
export function dayShort(iso: string): string {
  return DAYS_SHORT[parse(iso).getUTCDay()]!;
}

/** "jueves 12". */
export function dayLong(iso: string): string {
  const d = parse(iso);
  return `${DAYS_LONG[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** "16". */
export function dayNumber(iso: string): string {
  return String(parse(iso).getUTCDate());
}

/** "16 nov". */
export function dayMonth(iso: string): string {
  const d = parse(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** ISO 8601 week number. */
export function isoWeek(iso: string): number {
  const d = parse(iso);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** "16 – 20 nov", or "30 nov – 4 dic" across two months. */
export function weekRangeLabel(days: string[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return "";
  const a = parse(first);
  const b = parse(last);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
  return `${dayMonth(first)} – ${dayMonth(last)}`;
}

/** "Semana 47 · 16 – 20 nov · tu semana" or "· equipo de {n} personas". */
export function planSubtitle(data: Pick<PlanWeekData, "days" | "weekStart" | "people">): string {
  const days = daysOf(data);
  const who = data.people.length > 1 ? `equipo de ${data.people.length} personas` : "tu semana";
  return `Semana ${isoWeek(data.weekStart)} · ${weekRangeLabel(days)} · ${who}`;
}

/** "2 h", "1,5 h". */
export function hoursLabel(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${String(rounded).replace(".", ",")} h`;
}

/** "3/6" (hours over the workday). */
export function meterLabel(hours: number, workday: number): string {
  const n = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
  return `${n(hours)}/${n(workday)}`;
}

/** D10 grouped for the cells: up to 85 % "Con espacio", up to 100 % "Lleno", above "Sobrecargado". */
export function cellTone(hours: number, workday: number): PlanLoadTone {
  const day = workday > 0 ? workday : DEFAULT_PLAN_WORKDAY;
  const ratio = hours / day;
  if (ratio > 1) return "over";
  if (ratio > 0.85) return "full";
  return "space";
}

export const CELL_TONE_LABEL: Record<PlanLoadTone, string> = { space: "Con espacio", full: "Lleno", over: "Sobrecargado" };

/** One task the proposal puts in a lane cell. */
export type PlanPlacement = { changeId: string; taskId: string; title: string; staffId: string; date: string; hours: number };

/** The `task_date` changes of a plan proposal that are checked, as lane placements. Changes without a person go to `unassigned`. */
export function placementsOf(
  proposal: Proposal | null | undefined,
  checked: readonly string[],
  backlog: readonly PlanBacklogTask[],
): { placed: PlanPlacement[]; unassigned: PlanPlacement[] } {
  const placed: PlanPlacement[] = [];
  const unassigned: PlanPlacement[] = [];
  if (!proposal) return { placed, unassigned };
  for (const change of proposal.changes) {
    if (change.type !== "task_date" || !checked.includes(change.changeId)) continue;
    const hours = backlog.find((t) => t.taskId === change.taskId)?.hours ?? DEFAULT_PLAN_TASK_HOURS;
    const base = { changeId: change.changeId, taskId: change.taskId, title: change.title, date: change.after.date, hours };
    if (change.staffId) placed.push({ ...base, staffId: change.staffId });
    else unassigned.push({ ...base, staffId: "" });
  }
  return { placed, unassigned };
}

/** Load of one cell with the proposal drawn in: before + the checked placements. */
export function cellAfter(cell: PlanCell | undefined, placed: readonly PlanPlacement[], staffId: string, date: string): number {
  const base = cell?.before ?? 0;
  return base + placed.filter((p) => p.staffId === staffId && p.date === date).reduce((sum, p) => sum + p.hours, 0);
}

export function cellOf(data: Pick<PlanWeekData, "cells">, staffId: string, date: string): PlanCell | undefined {
  return data.cells.find((c) => c.staffId === staffId && c.date === date);
}

/** Total estimated hours of the backlog. */
export function backlogHours(backlog: readonly PlanBacklogTask[]): number {
  return backlog.reduce((sum, t) => sum + t.hours, 0);
}

/** "{n} por planear · {h} h". */
export function backlogSummary(backlog: readonly PlanBacklogTask[]): string {
  return `${backlog.length} por planear · ${hoursLabel(backlogHours(backlog)).replace(",0", "")}`;
}

/** The `move_tasks` input of one drop (drag and keyboard build the same proposal). */
export function moveInputFor(taskId: string, date: string): { moves: { taskId: string; toDate: string }[] } {
  return { moves: [{ taskId, toDate: date }] };
}

/** The `plan_week` input; `taskIds` are the rows dropped in the drop zone. */
export function planInputFor(weekStart: string, staffIds: readonly string[], taskIds: readonly string[]) {
  return {
    weekStart,
    ...(staffIds.length > 0 ? { staffIds: [...staffIds] } : {}),
    ...(taskIds.length > 0 ? { taskIds: [...taskIds] } : {}),
  };
}

/** Live-region text after a move. */
export function movedAnnouncement(title: string, date: string): string {
  return `Moviste ${title} al ${dayLong(date)}. Deshacer disponible.`;
}

/** Next cell index for an arrow key in a grid of `rows` × `cols`; the same cell when it can't move. */
export function nextCell(cur: { row: number; col: number }, key: string, rows: number, cols: number): { row: number; col: number } {
  switch (key) {
    case "ArrowLeft":
      return { row: cur.row, col: Math.max(0, cur.col - 1) };
    case "ArrowRight":
      return { row: cur.row, col: Math.min(cols - 1, cur.col + 1) };
    case "ArrowUp":
      return { row: Math.max(0, cur.row - 1), col: cur.col };
    case "ArrowDown":
      return { row: Math.min(rows - 1, cur.row + 1), col: cur.col };
    default:
      return cur;
  }
}
