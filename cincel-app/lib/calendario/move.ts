/**
 * Pure helpers of the Mes / Semana grids (FE §4.1, §11): moving a task to
 * another day in a cached range, the sort of a day's items, the cell keys and
 * the Spanish day labels. Client-safe.
 */
import { addDays, dayOfWeek } from "@/lib/time-tracking/local-time";
import type { CalDay, CalItem, CalTaskItem, CalendarioListPage, CalendarioRange } from "@/lib/types/calendario";

const PRIORITY_RANK: Record<string, number> = { urgente: 0, alta: 1, media: 2, baja: 3 };

/** The local `YYYY-MM-DD` of a date made with `new Date(y, m, d)`. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A `YYYY-MM-DD` string as a local-midnight `Date`. */
export function parseDateKey(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const DAY_FORMAT = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("es-MX", { weekday: "long", timeZone: "UTC" });
const SHORT_WEEKDAY_FORMAT = new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: "UTC" });
const MONTH_FORMAT = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** "jueves 12 de noviembre". */
export function longDayLabel(date: string): string {
  return DAY_FORMAT.format(utc(date)).replace(",", "");
}

/** "jueves 12". */
export function dayAndNumber(date: string): string {
  return `${WEEKDAY_FORMAT.format(utc(date))} ${Number(date.slice(8, 10))}`;
}

/** "LUN 9". */
export function columnHeading(date: string): string {
  return `${SHORT_WEEKDAY_FORMAT.format(utc(date)).replace(".", "").toUpperCase()} ${Number(date.slice(8, 10))}`;
}

/** "Noviembre 2026". */
export function monthLabel(date: string): string {
  const text = MONTH_FORMAT.format(utc(date)).replace(" de ", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The same day one month away, clamped to the month's last day. */
export function addMonths(date: string, delta: number): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + delta;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(Number(date.slice(8, 10)), last);
  return new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10);
}

/** Monday and Sunday of the week of `date`. */
export function weekBounds(date: string): { start: string; end: string } {
  const offset = (dayOfWeek(date) + 6) % 7;
  const start = addDays(date, -offset);
  return { start, end: addDays(start, 6) };
}

function timeOf(item: CalItem): string | null {
  return item.kind === "event" && !item.allDay ? item.start : null;
}

/** Order inside a day: meetings with a time first (by start), then tasks by priority; completed last. */
export function sortForGrid(items: readonly CalItem[]): CalItem[] {
  return [...items].sort((a, b) => {
    const ta = timeOf(a);
    const tb = timeOf(b);
    if (ta && tb) return ta.localeCompare(tb);
    if (ta) return -1;
    if (tb) return 1;
    const ca = a.kind === "task" && a.completed ? 1 : 0;
    const cb = b.kind === "task" && b.completed ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const pa = a.kind === "task" ? (PRIORITY_RANK[a.priority] ?? 4) : 4;
    const pb = b.kind === "task" ? (PRIORITY_RANK[b.priority] ?? 4) : 4;
    if (pa !== pb) return pa - pb;
    return a.title.localeCompare(b.title, "es");
  });
}

/** Items grouped by their day. */
export function itemsByDate(items: readonly CalItem[]): Map<string, CalItem[]> {
  const map = new Map<string, CalItem[]>();
  for (const item of items) {
    const list = map.get(item.date);
    if (list) list.push(item);
    else map.set(item.date, [item]);
  }
  for (const [date, list] of map) map.set(date, sortForGrid(list));
  return map;
}

/** "3 tareas, 1 reunión, 1 vencida" for a day's cell label. */
export function dayCounts(day: Pick<CalDay, "tasks" | "events" | "overdue"> | undefined): string {
  if (!day) return "sin elementos";
  const parts: string[] = [];
  if (day.tasks) parts.push(day.tasks === 1 ? "1 tarea" : `${day.tasks} tareas`);
  if (day.events) parts.push(day.events === 1 ? "1 reunión" : `${day.events} reuniones`);
  if (day.overdue) parts.push(day.overdue === 1 ? "1 vencida" : `${day.overdue} vencidas`);
  return parts.length ? parts.join(", ") : "sin elementos";
}

/** Items hidden by the per-day limit (counts come from `days`). */
export function hiddenCount(day: Pick<CalDay, "tasks" | "events" | "shown"> | undefined, visible: number): number {
  if (!day) return 0;
  return Math.max(0, day.tasks + day.events - Math.min(day.shown, visible));
}

function isOverdueOn(task: Pick<CalTaskItem, "completed">, date: string, today: string): boolean {
  return !task.completed && date < today;
}

function bump(days: CalDay[], date: string, task: CalTaskItem, sign: 1 | -1, overdue: boolean): CalDay[] {
  return days.map((day) =>
    day.date !== date
      ? day
      : {
          ...day,
          tasks: Math.max(0, day.tasks + sign),
          shown: Math.max(0, day.shown + sign),
          overdue: Math.max(0, day.overdue + (overdue ? sign : 0)),
          completed: Math.max(0, day.completed + (task.completed ? sign : 0)),
        },
  );
}

/**
 * The cached range after moving a task to `date`: the item changes day, the
 * overdue mark follows the new date and the counts of both days follow it.
 * A move out of the window drops the item. The same object when nothing moves.
 */
export function moveTaskInRange(range: CalendarioRange, itemId: string, date: string): CalendarioRange {
  const item = range.items.find((i): i is CalTaskItem => i.kind === "task" && i.id === itemId);
  if (!item || item.date === date) return range;
  const inside = date >= range.from && date <= range.to;
  const moved: CalTaskItem = { ...item, date, overdue: isOverdueOn(item, date, range.today) };
  let days = bump(range.days, item.date, item, -1, item.overdue);
  if (inside) days = bump(days, date, moved, 1, moved.overdue);
  return {
    ...range,
    days,
    items: inside ? range.items.map((i) => (i.id === itemId ? moved : i)) : range.items.filter((i) => i.id !== itemId),
    kpis: { ...range.kpis, overdue: Math.max(0, range.kpis.overdue + (moved.overdue ? 1 : 0) - (item.overdue ? 1 : 0)) },
  };
}

/** A cached list page after the same move (the row keeps its place; the server re-sorts on refetch). */
export function moveTaskInListPage(page: CalendarioListPage, itemId: string, date: string, today: string): CalendarioListPage {
  if (!page.rows.some((r) => r.id === itemId)) return page;
  return {
    ...page,
    rows: page.rows.map((row) =>
      row.id === itemId && row.kind === "task" ? { ...row, date, overdue: isOverdueOn(row, date, today) } : row,
    ),
  };
}
