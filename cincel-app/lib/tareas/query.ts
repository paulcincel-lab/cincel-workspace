/**
 * `/tareas` search params (redesign FE §2.1, §4.5): one typed query for the
 * three views and the filters. Pure and client-safe.
 *
 * `tarea`, `iniciar` and `project` also live on the URL but belong to the
 * task sheet and the Project Flow start slot; they are not part of the query.
 */
import type { TaskStatus } from "@/lib/types/core";

export type TareasVista = "tablero" | "lista" | "calendario";

/** "Mostrar" filter (`?mostrar=`): every task, the open ones, or the open ones past their due date. */
export type TareasMostrar = "todas" | "abiertas" | "en_retraso";
export const TAREAS_MOSTRAR: readonly TareasMostrar[] = ["todas", "abiertas", "en_retraso"];

export type TareasQuery = {
  vista: TareasVista;
  cal: "mes" | "semana" | "dia";
  tramo: string | null;
  /** "yo", a staff id, "todos" (written by Esencial's Solo mías toggle: everyone) or null. */
  responsable: "yo" | "todos" | string | null;
  proyecto: string | null;
  estado: string | null;
  q: string | null;
  /** `?mostrar=`; default "todas" (left out of the URL). */
  mostrar: TareasMostrar;
  nueva?: boolean;
  /** Calendar cursor (`?fecha=YYYY-MM-DD`): the day the Calendario view is anchored on; null = today. */
  fecha?: string | null;
};

export const TAREAS_VISTAS: readonly TareasVista[] = ["tablero", "lista", "calendario"];
export const TAREAS_CAL_MODES: readonly TareasQuery["cal"][] = ["mes", "semana", "dia"];
export const TAREAS_ESTADOS: readonly TaskStatus[] = ["pendiente", "en_proceso", "completado", "bloqueado"];

/** Longest `q` kept from the URL. */
export const TAREAS_SEARCH_MAX = 200;

export const DEFAULT_TAREAS_QUERY: TareasQuery = {
  vista: "tablero",
  cal: "mes",
  tramo: null,
  responsable: null,
  proyecto: null,
  estado: null,
  q: null,
  mostrar: "todas",
  nueva: false,
  fecha: null,
};

/** Tramo keys (`workflows.key`): letters, digits, `_` and `-`. */
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Row ids (staff, projects) are UUIDs. */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function key(value: string | null): string | null {
  return value !== null && KEY_RE.test(value) ? value : null;
}

function id(value: string | null): string | null {
  return value !== null && ID_RE.test(value) ? value.toLowerCase() : null;
}

/** Calendar dates: `YYYY-MM-DD`. */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day as `YYYY-MM-DD`, or null (`2026-02-30` is null). */
function calendarDate(value: string | null): string | null {
  const m = value === null ? null : DATE_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? value : null;
}

function searchText(value: string | null): string | null {
  const trimmed = value?.trim().slice(0, TAREAS_SEARCH_MAX).trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** URL → query; unknown or malformed values fall back to the defaults. */
export function parseTareasQuery(sp: URLSearchParams): TareasQuery {
  const responsable = sp.get("responsable");
  const estado = sp.get("estado");
  return {
    vista: pick(sp.get("vista"), TAREAS_VISTAS, DEFAULT_TAREAS_QUERY.vista),
    cal: pick(sp.get("cal"), TAREAS_CAL_MODES, DEFAULT_TAREAS_QUERY.cal),
    tramo: key(sp.get("tramo")),
    responsable: responsable === "yo" || responsable === TAREAS_RESPONSABLE_TODOS ? responsable : id(responsable),
    proyecto: id(sp.get("proyecto")),
    estado: estado !== null && (TAREAS_ESTADOS as readonly string[]).includes(estado) ? estado : null,
    q: searchText(sp.get("q")),
    mostrar: pick(sp.get("mostrar"), TAREAS_MOSTRAR, DEFAULT_TAREAS_QUERY.mostrar),
    nueva: sp.get("nueva") === "1",
    fecha: calendarDate(sp.get("fecha")),
  };
}

/** `?…` for a partial query (round trip with `parseTareasQuery`). Defaults are left out; "" when nothing is set. */
export function toTareasSearch(q: Partial<TareasQuery>): string {
  const sp = new URLSearchParams();
  if (q.vista && q.vista !== DEFAULT_TAREAS_QUERY.vista) sp.set("vista", q.vista);
  if (q.cal && q.cal !== DEFAULT_TAREAS_QUERY.cal) sp.set("cal", q.cal);
  if (q.tramo) sp.set("tramo", q.tramo);
  if (q.responsable) sp.set("responsable", q.responsable);
  if (q.proyecto) sp.set("proyecto", q.proyecto);
  if (q.estado) sp.set("estado", q.estado);
  const text = q.q?.trim();
  if (text) sp.set("q", text);
  if (q.mostrar && q.mostrar !== DEFAULT_TAREAS_QUERY.mostrar) sp.set("mostrar", q.mostrar);
  if (q.nueva) sp.set("nueva", "1");
  if (q.fecha) sp.set("fecha", q.fecha);
  const out = sp.toString();
  return out === "" ? "" : `?${out}`;
}

/** `/tareas` plus the search of `q`. */
export function tareasHref(q: Partial<TareasQuery>): string {
  return `/tareas${toTareasSearch(q)}`;
}

/** Page `searchParams` (RSC) → `URLSearchParams`; a repeated key keeps its first value. */
export function toUrlSearchParams(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [name, value] of Object.entries(sp)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) out.set(name, first);
  }
  return out;
}

/** True when any filter (tramo, responsable, proyecto, estado, search, mostrar) narrows the tasks. */
export function hasTareasFilters(q: TareasQuery): boolean {
  return Boolean(q.tramo || responsableFilter(q.responsable) || q.proyecto || q.estado || q.q || (q.mostrar && q.mostrar !== "todas"));
}

/** `?responsable=todos`: everyone's tasks, kept in the URL so Esencial's "Solo mías" off is shareable. */
export const TAREAS_RESPONSABLE_TODOS = "todos";

/** The responsable a query filters by: "todos" filters nothing. */
export function responsableFilter(responsable: TareasQuery["responsable"]): "yo" | string | null {
  return responsable === TAREAS_RESPONSABLE_TODOS ? null : responsable;
}

/**
 * The responsable Tareas Esencial filters by: a missing param is "yo" (Solo
 * mías on by default), "todos" is everyone, anything else as given.
 */
export function esencialResponsable(responsable: TareasQuery["responsable"]): "yo" | string | null {
  return responsable === null ? "yo" : responsableFilter(responsable);
}

/** True when Solo mías is on in Esencial: no param, or "yo". */
export function isEsencialSoloMias(responsable: TareasQuery["responsable"]): boolean {
  return esencialResponsable(responsable) === "yo";
}

/**
 * True when an Esencial filter narrows the tasks: the tramo, proyecto,
 * estado, search, mostrar, or a responsable other than "yo" (Solo mías off
 * counts, so "Quitar filtros" brings it back).
 */
export function hasEsencialFilters(q: TareasQuery): boolean {
  return Boolean(
    q.tramo || q.proyecto || q.estado || q.q || (q.mostrar && q.mostrar !== "todas") || !isEsencialSoloMias(q.responsable),
  );
}

/** The query with every filter removed; the view, the calendar mode and the calendar date stay. */
export function clearTareasFilters(q: TareasQuery): TareasQuery {
  return { ...DEFAULT_TAREAS_QUERY, vista: q.vista, cal: q.cal, fecha: q.fecha ?? null };
}

/** Local `YYYY-MM-DD` of a date. */
export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Monday of the week that holds `d` (es-MX calendars start on Monday). */
function weekStart(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/**
 * Inclusive `YYYY-MM-DD` range the Calendario view loads for a mode:
 * `mes` = the month grid padded to whole weeks, `semana` = Monday to Sunday,
 * `dia` = that day.
 */
export function tareasCalendarRange(cal: TareasQuery["cal"], today: Date): { from: string; to: string } {
  if (cal === "dia") return { from: isoDate(today), to: isoDate(today) };
  if (cal === "semana") {
    const start = weekStart(today);
    return { from: isoDate(start), to: isoDate(addDays(start, 6)) };
  }
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: isoDate(weekStart(first)), to: isoDate(addDays(weekStart(last), 6)) };
}
