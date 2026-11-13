/** Esencial agenda groups (FE §4.2). Pure and client-safe. */
import { addDays, dayOfWeek, localHourMinute, mondayOf } from "@/lib/time-tracking/local-time";
import type { CalItem, CalView, CalendarioRange } from "@/lib/types/calendario";

export const VENCIDAS_CAP = 20;

export type EsencialGroupKey = "vencidas" | "hoy" | "manana" | "semana" | "mes";
export type EsencialGroup = {
  key: EsencialGroupKey;
  title: string;
  sub: string;
  /** Items shown (Vencidas is capped). */
  items: CalItem[];
  /** Items of the group before the cap. */
  total: number;
};

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m: m - 1, d };
}

/** "11 nov". */
export function shortDate(date: string): string {
  const { m, d } = parts(date);
  return `${d} ${MONTHS_SHORT[m]}`;
}

/** "mié 11 nov". */
export function weekdayDate(date: string): string {
  return `${WEEKDAYS_SHORT[dayOfWeek(date)]} ${shortDate(date)}`;
}

/** Last day of the month of `date`. */
function monthEnd(date: string): string {
  const { y, m } = parts(date);
  return new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
}

function rangeLabel(from: string, to: string, withWeekday: boolean): string {
  const a = parts(from);
  const b = parts(to);
  const left = withWeekday ? `${WEEKDAYS_SHORT[dayOfWeek(from)]} ${a.d}` : `${a.d}`;
  const right = withWeekday ? `${WEEKDAYS_SHORT[dayOfWeek(to)]} ${b.d}` : `${b.d}`;
  if (a.m === b.m) return `${left} – ${right}${withWeekday ? "" : ` ${MONTHS_SHORT[b.m]}`}`;
  return `${left} ${MONTHS_SHORT[a.m]} – ${right} ${MONTHS_SHORT[b.m]}`;
}

function sortKey(item: CalItem): [string, number, string] {
  return item.kind === "event" ? [item.date, 0, item.start] : [item.date, 1, ""];
}

/** Date, then meetings by start, then tasks in the order they came. */
export function sortAgendaItems(items: readonly CalItem[]): CalItem[] {
  return items
    .map((item, index) => ({ item, index, key: sortKey(item) }))
    .sort((x, y) => (x.key[0] < y.key[0] ? -1 : x.key[0] > y.key[0] ? 1 : x.key[1] - y.key[1] || (x.key[2] < y.key[2] ? -1 : x.key[2] > y.key[2] ? 1 : x.index - y.index)))
    .map((entry) => entry.item);
}

function isOverdueTask(item: CalItem): boolean {
  return item.kind === "task" && item.overdue && !item.completed;
}

/**
 * The groups of the vista around the anchor day: today when the range holds
 * it, else the first day of the range. Overdue tasks go only under Vencidas.
 * Empty groups are left out.
 */
export function esencialGroups(range: CalendarioRange, vista: CalView): EsencialGroup[] {
  const anchored = range.today >= range.from && range.today <= range.to;
  const anchor = anchored ? range.today : range.from;
  const tomorrow = addDays(anchor, 1);
  const weekEnd = addDays(mondayOf(anchor), 6);
  const restFrom = addDays(weekEnd, 1);
  const monthLast = monthEnd(anchor);

  const overdue = sortAgendaItems(range.items.filter(isOverdueTask));
  const rest = sortAgendaItems(range.items.filter((item) => !isOverdueTask(item)));
  const within = (from: string, to: string) => rest.filter((item) => item.date >= from && item.date <= to);

  const groups: EsencialGroup[] = [];
  if (overdue.length > 0) {
    groups.push({
      key: "vencidas",
      title: "Vencidas",
      sub: overdue.length === 1 ? "1 tarea" : `${overdue.length} tareas`,
      items: overdue.slice(0, VENCIDAS_CAP),
      total: overdue.length,
    });
  }
  const push = (key: EsencialGroupKey, title: string, sub: string, items: CalItem[]) => {
    if (items.length > 0) groups.push({ key, title, sub, items, total: items.length });
  };
  push("hoy", anchored ? "Hoy" : weekdayDate(anchor), weekdayDate(anchor), within(anchor, anchor));
  if (vista !== "dia") {
    push("manana", anchored ? "Mañana" : weekdayDate(tomorrow), weekdayDate(tomorrow), within(tomorrow, tomorrow));
    const from = addDays(anchor, 2);
    if (from <= weekEnd) push("semana", "Esta semana", rangeLabel(from, weekEnd, true), within(from, weekEnd));
  }
  if (vista === "mes" && restFrom <= monthLast) {
    const { m } = parts(anchor);
    push("mes", `Resto de ${MONTHS_LONG[m]}`, rangeLabel(restFrom, monthLast, false), within(restFrom, monthLast));
  }
  return groups;
}

/** Trailing "when" of a row: "10:00", "hoy", "12 nov", "12 nov 10:00". */
export function whenLabel(item: CalItem, group: EsencialGroupKey, today: string): string {
  if (item.kind === "event") {
    if (item.allDay) return group === "hoy" || group === "manana" ? "Todo el día" : `${shortDate(item.date)} · todo el día`;
    const time = localHourMinute(new Date(item.start));
    return group === "hoy" || group === "manana" ? time : `${shortDate(item.date)} ${time}`;
  }
  if (item.date === today) return "hoy";
  return shortDate(item.date);
}

/** Second line of a row: "Reunión · Madrid 22" or "Madrid 22 · Diseño". */
export function lineLabel(item: CalItem): string {
  if (item.kind === "event") {
    const where = item.project?.name ?? item.location;
    return where ? `Reunión · ${where}` : "Reunión";
  }
  const line = [item.project?.name, item.etapa?.name].filter(Boolean).join(" · ");
  return line || "Tarea";
}
