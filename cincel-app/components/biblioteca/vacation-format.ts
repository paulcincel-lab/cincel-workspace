/**
 * Pure helpers of Mis vacaciones (redesign FE §3.7): labels, es-MX dates in
 * lowercase, the request day count shown in the form and the history, and the
 * shapes handed to the widget library. Client-safe.
 */
import type { TeamAbsence, VacationBalance, VacationKind, VacationRequest, VacationStatus } from "@/lib/types/redesign";
import type { AgendaItem, KpiDatum, RecordTableData } from "@/lib/types/widgets";

/** Local day of the organization (BE §8.7: the regional setting is fixed to it). */
export const VACATIONS_TIME_ZONE = "America/Mexico_City";

export const VACATION_KIND_LABEL: Record<VacationKind, string> = {
  vacaciones: "Vacaciones",
  personal: "Día personal",
  enfermedad: "Incapacidad",
};

export const VACATION_KIND_OPTIONS: VacationKind[] = ["vacaciones", "personal", "enfermedad"];

export const VACATION_STATUS_LABEL: Record<VacationStatus, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

/** Plain shadcn `Badge` variants per status (colors only from tokens). */
export const VACATION_STATUS_BADGE: Record<VacationStatus, "outline" | "secondary" | "destructive" | "ghost"> = {
  pendiente: "outline",
  aprobada: "secondary",
  rechazada: "destructive",
  cancelada: "ghost",
};

/** The masked kind of `fetchTeamAbsencesAction` (B12) reads "Ausencia". */
export function absenceKindLabel(kind: TeamAbsence["kind"]): string {
  return kind === "ausencia" ? "Ausencia" : VACATION_KIND_LABEL[kind];
}

/** Today as "YYYY-MM-DD" in the organization's time zone. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VACATIONS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The current month as "YYYY-MM" in the organization's time zone. */
export function currentMonth(now: Date = new Date()): string {
  return todayIso(now).slice(0, 7);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const date = parseIsoDay(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseIsoDay(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

const DAY_MONTH = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
const DAY_ONLY = new Intl.DateTimeFormat("es-MX", { day: "numeric", timeZone: "UTC" });
const MONTH_NAME = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });

function lower(text: string): string {
  return text.replace(/\./g, "").toLocaleLowerCase("es-MX");
}

/** "16 dic". */
export function formatDay(iso: string): string {
  return lower(DAY_MONTH.format(parseIsoDay(iso)));
}

/** "16 – 20 dic", "28 nov – 2 dic" or "22 oct" for a single day. */
export function formatRange(from: string, to: string): string {
  if (from === to) return formatDay(from);
  const a = parseIsoDay(from);
  const b = parseIsoDay(to);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return `${DAY_ONLY.format(a)} – ${formatDay(to)}`;
  }
  return `${formatDay(from)} – ${formatDay(to)}`;
}

/** "noviembre" for "2026-11". */
export function formatMonthName(month: string): string {
  return lower(MONTH_NAME.format(parseIsoDay(`${month}-01`)));
}

/** "noviembre de 2026" for "2026-11". */
export function formatMonthYear(month: string): string {
  return lower(MONTH_YEAR.format(parseIsoDay(`${month}-01`)));
}

/**
 * Work days (Monday–Friday) in `[from, to]`, the estimate the form and the
 * history show; the server counts with the organization's work days.
 * 0 when the range is invalid.
 */
export function workDaysBetween(from: string, to: string): number {
  if (!isIsoDay(from) || !isIsoDay(to) || to < from) return 0;
  let count = 0;
  const cursor = parseIsoDay(from);
  const end = parseIsoDay(to);
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function daysLabel(days: number): string {
  return days === 1 ? "1 día" : `${days} días`;
}

/** Cancel is offered for a pending request or an approved one that starts in the future (BE §7.8). */
export function canCancelRequest(request: VacationRequest, today: string): boolean {
  if (request.status === "pendiente") return true;
  return request.status === "aprobada" && request.from > today;
}

/** The balance as `KpiWidget` items: Disponibles, Tomados, Pendientes. */
export function balanceKpis(balance: VacationBalance): KpiDatum[] {
  return [
    {
      key: "disponibles",
      label: "Disponibles",
      value: balance.available,
      display: `${balance.available} de ${balance.entitled}`,
      caption: "Días disponibles este año",
    },
    { key: "tomados", label: "Tomados", value: balance.taken, caption: daysLabel(balance.taken) },
    { key: "pendientes", label: "Pendientes", value: balance.pending, caption: "Por aprobar" },
  ];
}

/** History rows for `RecordTable`; `estado` and `acciones` are rendered by the caller. */
export function historyTable(requests: VacationRequest[], options: { withActions: boolean }): RecordTableData {
  return {
    columns: [
      { key: "fechas", label: "Fechas" },
      { key: "dias", label: "Días", align: "right", mono: true, format: "count" },
      { key: "tipo", label: "Tipo" },
      { key: "comentario", label: "Comentario", hideOn: ["esencial"] },
      { key: "estado", label: "Estado" },
      ...(options.withActions ? [{ key: "acciones", label: "Acciones" }] : []),
    ],
    rows: requests.map((request) => ({
      id: request.id,
      fechas: formatRange(request.from, request.to),
      dias: workDaysBetween(request.from, request.to),
      tipo: VACATION_KIND_LABEL[request.kind],
      comentario: request.comment,
      estado: VACATION_STATUS_LABEL[request.status],
      acciones: "",
    })),
  };
}

/** Team absences as all-day `AgendaWidget` items; masked kinds read "Ausencia". */
export function absencesToAgendaItems(absences: TeamAbsence[]): AgendaItem[] {
  return absences.map((absence, index) => ({
    id: `${absence.staffId}:${absence.from}:${index}`,
    title: `${absence.name} · ${absenceKindLabel(absence.kind)}`,
    start: absence.from,
    end: absence.to,
    allDay: true,
  }));
}
