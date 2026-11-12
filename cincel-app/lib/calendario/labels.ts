/**
 * Spanish labels of the Calendario header and toolbar (FE §3): the range label,
 * the subtitle with counts, the adjacent anchor of Anterior / Siguiente and
 * the default vista per Estilo (F3). Pure and client-safe; dates are
 * `YYYY-MM-DD` strings handled as UTC midnights.
 */
import { rangeOf } from "@/lib/calendario/range";
import { addDays, dayOfWeek, mondayOf } from "@/lib/time-tracking/local-time";
import type { CalKpis, CalView } from "@/lib/types/calendario";
import type { PresentationStyle } from "@/lib/types/redesign";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function parts(date: string): { year: number; month: number; day: number } {
  const [year = "1970", month = "1", day = "1"] = date.split("-");
  return { year: Number(year), month: Number(month) - 1, day: Number(day) };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Default vista per Estilo (Decision F3): Visual Mes, Esencial and Analítico Semana. */
export function defaultCalVista(style: PresentationStyle | null | undefined): CalView {
  return style === "visual" ? "mes" : "semana";
}

/** Whether the Estilo reads the paged rows of the range (`qk.calendario.list`), so the page prefetches the first page. */
export function readsRowList(style: PresentationStyle | null | undefined): boolean {
  return style === "analitico";
}

/** ISO 8601 week number (Monday-first, week 1 holds the first Thursday). */
export function isoWeek(date: string): number {
  const thursday = addDays(mondayOf(date), 3);
  const { year } = parts(thursday);
  const firstThursday = mondayOf(`${year}-01-04`);
  const diffDays = Math.round((Date.parse(`${mondayOf(date)}T00:00:00Z`) - Date.parse(`${firstThursday}T00:00:00Z`)) / 86_400_000);
  return 1 + Math.floor(diffDays / 7);
}

/** "mié 11 nov". */
export function shortDayLabel(date: string): string {
  const { month, day } = parts(date);
  return `${WEEKDAYS[dayOfWeek(date)]!.slice(0, 3)} ${day} ${MONTHS_SHORT[month]}`;
}

/** "Noviembre 2026". */
export function monthLabel(date: string): string {
  const { year, month } = parts(date);
  return `${capitalize(MONTHS[month]!)} ${year}`;
}

/** "miércoles 11 nov 2026". */
export function longDayLabel(date: string): string {
  const { year, month, day } = parts(date);
  return `${WEEKDAYS[dayOfWeek(date)]} ${day} ${MONTHS_SHORT[month]} ${year}`;
}

/** The label of the visible range: "Noviembre 2026", "9 – 15 nov 2026", "miércoles 11 nov 2026". */
export function rangeLabel(vista: CalView, fecha: string): string {
  if (vista === "mes") return monthLabel(fecha);
  if (vista === "dia") return longDayLabel(fecha);
  const { from, to } = rangeOf("semana", fecha);
  const a = parts(from);
  const b = parts(to);
  if (a.month === b.month) return `${a.day} – ${b.day} ${MONTHS_SHORT[b.month]} ${b.year}`;
  const left = a.year === b.year ? `${a.day} ${MONTHS_SHORT[a.month]}` : `${a.day} ${MONTHS_SHORT[a.month]} ${a.year}`;
  return `${left} – ${b.day} ${MONTHS_SHORT[b.month]} ${b.year}`;
}

export function pluralTasks(n: number): string {
  return n === 1 ? "1 tarea" : `${n} tareas`;
}

export function pluralMeetings(n: number): string {
  return n === 1 ? "1 reunión" : `${n} reuniones`;
}

export function pluralOverdue(n: number): string {
  return n === 1 ? "1 vencida" : `${n} vencidas`;
}

/** The head of the subtitle: "Noviembre 2026", "Semana 46", "Hoy" or "Miércoles 11 nov 2026". */
export function subtitleHead(vista: CalView, fecha: string, today: string): string {
  if (vista === "mes") return monthLabel(fecha);
  if (vista === "semana") return `Semana ${isoWeek(fecha)}`;
  return fecha === today ? "Hoy" : capitalize(longDayLabel(fecha));
}

/** The counts of the subtitle, without the overdue part: "38 tareas y 9 reuniones". */
export function subtitleCounts(kpis: Pick<CalKpis, "tasks" | "meetings">): string {
  return `${pluralTasks(kpis.tasks)} y ${pluralMeetings(kpis.meetings)}`;
}

/**
 * The anchor of the previous (-1) or next (+1) range: a day, a week, or the
 * same day of the adjacent month (clamped to its length).
 */
export function shiftFecha(vista: CalView, fecha: string, direction: -1 | 1): string {
  if (vista === "dia") return addDays(fecha, direction);
  if (vista === "semana") return addDays(fecha, 7 * direction);
  const { year, month, day } = parts(fecha);
  const target = new Date(Date.UTC(year, month + direction, 1));
  const length = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-${String(Math.min(day, length)).padStart(2, "0")}`;
}
