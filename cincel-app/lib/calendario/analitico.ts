/**
 * Analítico of /calendario (FE §4.3): groups, captions, KPIs and the row model of the table.
 * Pure and client-safe. Groups and their counts come from `CalendarioRange.days`, so the
 * headers show the totals of the whole range before any row loads; rows are placed in their
 * group by date, in the order the server pages them (no client sort, rule 9).
 */
import { addDays, dayOfWeek } from "@/lib/time-tracking/local-time";
import type { CalDay, CalItem, CalKpis, CalView } from "@/lib/types/calendario";

export type AnaliticoOrder = "asc" | "desc";

export type AnaliticoGroupModel = {
  id: string;
  label: string;
  /** First and last date of the group (inclusive). */
  from: string;
  to: string;
  /** Items of the whole range in this group (from `days`). */
  count: number;
  /** "{n} elementos". */
  caption: string;
};

const WEEKDAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
const MONTH = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;
const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

const NUMBER = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

function parts(date: string): { y: number; m: number; d: number } {
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)) };
}

const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "mié 11": the FECHA cell. */
export function shortDate(date: string): string {
  return `${WEEKDAY_SHORT[dayOfWeek(date)]} ${parts(date).d}`;
}

/** "11 nov". */
export function dayMonth(date: string): string {
  const { d, m } = parts(date);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

/** "miércoles 11 nov". */
export function longDate(date: string): string {
  return `${WEEKDAY[dayOfWeek(date)]} ${dayMonth(date)}`;
}

/** "9 – 15 nov", or "30 oct – 5 nov" across months. */
export function dateSpan(from: string, to: string): string {
  if (from === to) return dayMonth(from);
  const a = parts(from);
  const b = parts(to);
  return a.m === b.m && a.y === b.y ? `${a.d} – ${dayMonth(to)}` : `${dayMonth(from)} – ${dayMonth(to)}`;
}

/** ISO 8601 week number of a date. */
export function isoWeek(date: string): number {
  const thursday = addDays(date, 3 - ((dayOfWeek(date) + 6) % 7));
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  const days = Math.round((Date.parse(`${thursday}T00:00:00Z`) - Date.parse(`${jan1}T00:00:00Z`)) / 86_400_000);
  return Math.floor(days / 7) + 1;
}

/** "Hoy, miércoles 11 nov · por hora" / "Semana 46, 9 – 15 nov · por día" / "Noviembre 2026 · agrupado por semana". */
export function rangeCaption(view: CalView, input: { fecha: string; from: string; to: string; today: string }): string {
  if (view === "dia") {
    const date = longDate(input.fecha);
    return `${input.fecha === input.today ? `Hoy, ${date}` : cap(date)} · por hora`;
  }
  if (view === "semana") return `Semana ${isoWeek(input.from)}, ${dateSpan(input.from, input.to)} · por día`;
  const { y, m } = parts(input.fecha);
  return `${cap(MONTH[m - 1])} ${y} · agrupado por semana`;
}

/** "{n} elementos" (singular "1 elemento"). */
export function groupCaption(count: number): string {
  return count === 1 ? "1 elemento" : `${count} elementos`;
}

function weekLabel(from: string, to: string): string {
  return `Semana ${isoWeek(from)} · ${dateSpan(from, to)}`;
}

const itemsOfDay = (day: CalDay): number => day.tasks + day.events;

/**
 * The groups of the table: Día one group (the day), Semana one per day, Mes one per ISO
 * week (Decision F7). Counts come from `days`; `desc` reverses the group order.
 */
export function buildGroups(view: CalView, days: readonly CalDay[], order: AnaliticoOrder, today: string): AnaliticoGroupModel[] {
  const groups: AnaliticoGroupModel[] = [];
  if (view === "mes") {
    for (const day of days) {
      const monday = addDays(day.date, -((dayOfWeek(day.date) + 6) % 7));
      const id = `w:${monday}`;
      const last = groups[groups.length - 1];
      if (last && last.id === id) {
        last.to = day.date;
        last.count += itemsOfDay(day);
        continue;
      }
      groups.push({ id, label: "", from: day.date, to: day.date, count: itemsOfDay(day), caption: "" });
    }
    for (const g of groups) {
      g.label = weekLabel(g.from, g.to);
      g.caption = groupCaption(g.count);
    }
  } else {
    for (const day of days) {
      const count = itemsOfDay(day);
      const date = longDate(day.date);
      groups.push({
        id: `d:${day.date}`,
        label: day.date === today ? `Hoy · ${date}` : cap(date),
        from: day.date,
        to: day.date,
        count,
        caption: groupCaption(count),
      });
    }
  }
  return order === "desc" ? groups.reverse() : groups;
}

/** The loaded rows that fall in a group, in the order they came. */
export function rowsOfGroup(group: Pick<AnaliticoGroupModel, "from" | "to">, rows: readonly CalItem[]): CalItem[] {
  return rows.filter((item) => item.date >= group.from && item.date <= group.to);
}

/** Rows still to load in a group (never negative). */
export function remainingOf(group: Pick<AnaliticoGroupModel, "count">, loaded: number): number {
  return Math.max(0, group.count - loaded);
}

export type AnaliticoKpiModel = { key: string; label: string; value: number; secondary: string; tone?: "destructive" };

/** TAREAS, REUNIONES (+ h), VENCIDAS (+ %), SIN RESPONSABLE (FE §4.3). */
export function kpiItems(kpis: CalKpis): AnaliticoKpiModel[] {
  return [
    { key: "tareas", label: "TAREAS", value: kpis.tasks, secondary: "en el rango" },
    { key: "reuniones", label: "REUNIONES", value: kpis.meetings, secondary: `${NUMBER.format(kpis.meetingHours)} h en total` },
    { key: "vencidas", label: "VENCIDAS", value: kpis.overdue, secondary: `${NUMBER.format(Math.round(kpis.overduePct))} % del rango`, tone: "destructive" },
    { key: "sin-responsable", label: "SIN RESPONSABLE", value: kpis.unassigned, secondary: "asígnalas desde la celda" },
  ];
}

/** "10:00" from an ISO time with offset ("2026-11-11T10:00:00-06:00"), "Todo el día", or "—" for a task. */
export function timeOf(item: CalItem): string {
  if (item.kind === "task") return "—";
  return item.allDay ? "Todo el día" : item.start.slice(11, 16);
}

/** "Ana García", "Ana García +2", or "—". Tasks: the responsable; meetings: the first attendee. */
export function peopleOf(item: CalItem): string {
  if (item.kind === "task") return item.manager?.name ?? "—";
  const first = item.attendees[0]?.name ?? item.organizer?.name;
  if (!first) return "—";
  const extra = Math.max(0, item.attendeeCount - 1);
  return extra > 0 ? `${first} +${extra}` : first;
}
