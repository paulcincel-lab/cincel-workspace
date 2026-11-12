/** Días que avisan (FE §7.4): copy and ordering of the day alerts. Pure and client-safe. */
import { LOAD_LABEL_COPY } from "@/lib/calendario/load";
import type { CalDay, LoadLabel } from "@/lib/types/calendario";

export const MAX_DAY_ALERTS = 2;
export const HEAT_WARN_PCT = 85;
export const HEAT_CRIT_PCT = 100;

export type DayAlertKind = "overload" | "overlap";
export type DayAlert = { kind: DayAlertKind; date: string; message: string; actionLabel: string };

export const OVERLOAD_ACTION_LABEL = "✦ Reparte esto";
export const OVERLAP_ACTION_LABEL = "✦ Resolver traslape";
export const OVERLAP_APPLY_LABEL = "Aplicar y avisar";
export const OVERLAP_TAG = "Se traslapan";
export const METER_LABEL = "Carga del día";

/** "9.5" / "6": at most one decimal, no trailing zero. */
export function formatHours(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function hoursOfWorkday(hours: number, workday: number): string {
  return `${formatHours(hours)} h de ${formatHours(workday)} h`;
}

function dateAtNoon(date: string): Date | null {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "jueves" */
export function weekdayName(date: string): string {
  const parsed = dateAtNoon(date);
  return parsed ? new Intl.DateTimeFormat("es-MX", { weekday: "long", timeZone: "UTC" }).format(parsed) : date;
}

/** "jueves 12" */
export function weekdayAndDay(date: string): string {
  const parsed = dateAtNoon(date);
  return parsed ? `${weekdayName(date)} ${parsed.getUTCDate()}` : date;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Percent of the jornada, whole number. */
export function loadPct(hours: number, workday: number): number {
  if (workday <= 0) return hours > 0 ? 999 : 0;
  return Math.round((hours / workday) * 100);
}

/** ISO week number (Monday first) of a YYYY-MM-DD date. */
export function isoWeekNumber(date: string): number {
  const parsed = dateAtNoon(date);
  if (!parsed) return 0;
  const day = parsed.getUTCDay() || 7;
  parsed.setUTCDate(parsed.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(parsed.getUTCFullYear(), 0, 1);
  return Math.ceil(((parsed.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** "Semana 46 · tu carga por día (jornada de 6 h de trabajo)" */
export function loadSubtitle(weekDate: string, workday: number): string {
  return `Semana ${isoWeekNumber(weekDate)} · tu carga por día (jornada de ${formatHours(workday)} h de trabajo)`;
}

export function isOverloaded(day: Pick<CalDay, "hours" | "workday" | "loadLabel">): boolean {
  return day.loadLabel === "sobrecargado" || (day.hours !== null && day.workday !== null && day.hours > day.workday);
}

function overlapMessage(date: string, pairs: number): string {
  const when = `El ${weekdayName(date)}`;
  return pairs === 1 ? `${when} se traslapan 2 reuniones` : `${when} hay ${pairs} traslapes de reuniones`;
}

/** Banners of the range: overload first (heaviest first), then overlaps; at most two. */
export function buildDayAlerts(days: readonly CalDay[], max: number = MAX_DAY_ALERTS): DayAlert[] {
  const overloads = days
    .filter((d) => d.hours !== null && d.workday !== null && isOverloaded(d))
    .sort((a, b) => loadPct(b.hours ?? 0, b.workday ?? 0) - loadPct(a.hours ?? 0, a.workday ?? 0) || a.date.localeCompare(b.date))
    .map<DayAlert>((d) => ({
      kind: "overload",
      date: d.date,
      message: `El ${weekdayAndDay(d.date)} tiene ${formatHours(d.hours ?? 0)} h de ${formatHours(d.workday ?? 0)} h`,
      actionLabel: OVERLOAD_ACTION_LABEL,
    }));
  const overlapping = days
    .filter((d) => d.overlaps > 0)
    .sort((a, b) => b.overlaps - a.overlaps || a.date.localeCompare(b.date))
    .map<DayAlert>((d) => ({ kind: "overlap", date: d.date, message: overlapMessage(d.date, d.overlaps), actionLabel: OVERLAP_ACTION_LABEL }));
  return [...overloads, ...overlapping].slice(0, max);
}

/** Esencial line of a day: "Jueves · 9.5 h de 6 h · Sobrecargado". */
export function dayLoadLine(day: Pick<CalDay, "date" | "hours" | "workday" | "loadLabel">): string | null {
  if (day.hours === null || day.workday === null || day.loadLabel === null) return null;
  return `${capitalize(weekdayName(day.date))} · ${hoursOfWorkday(day.hours, day.workday)} · ${LOAD_LABEL_COPY[day.loadLabel]}`;
}

/**
 * Hours a day shows while a proposal is open: the after value of the matching cell when there is
 * one, else the current hours.
 */
export function hoursWithProposal(
  date: string,
  hours: number,
  cells: readonly { staffId: string; date: string; before: number; after: number }[] | undefined,
  staffId?: string,
): number {
  if (!cells) return hours;
  const cell = cells.find((c) => c.date === date && (staffId === undefined || c.staffId === staffId));
  return cell ? cell.after : hours;
}

export function labelOf(hours: number, workday: number): LoadLabel {
  const pct = loadPct(hours, workday);
  if (pct < 50) return "libre";
  if (pct <= HEAT_WARN_PCT) return "bien";
  if (pct <= HEAT_CRIT_PCT) return "casi_lleno";
  return "sobrecargado";
}
