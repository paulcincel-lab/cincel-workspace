/**
 * `/tareas` search params (redesign FE §2.1, §4.5): one typed query for the
 * filters every style shares. The layout comes from the Estilo (`?estilo=`),
 * not from this query. Pure and client-safe.
 *
 * `tarea`, `iniciar` and `project` also live on the URL but belong to the
 * task sheet and the Project Flow start slot; they are not part of the query.
 */
import type { TaskStatus } from "@/lib/types/core";

/** "Mostrar" filter (`?mostrar=`): every task, the open ones, or the open ones past their due date. */
export type TareasMostrar = "todas" | "abiertas" | "en_retraso";
export const TAREAS_MOSTRAR: readonly TareasMostrar[] = ["todas", "abiertas", "en_retraso"];

export type TareasQuery = {
  tramo: string | null;
  /** "yo", a staff id, "todos" (written by Esencial's Solo mías toggle: everyone) or null. */
  responsable: "yo" | "todos" | string | null;
  proyecto: string | null;
  estado: string | null;
  q: string | null;
  /** `?mostrar=`; default "todas" (left out of the URL). */
  mostrar: TareasMostrar;
  nueva?: boolean;
};

export const TAREAS_ESTADOS: readonly TaskStatus[] = ["pendiente", "en_proceso", "completado", "bloqueado"];

/** Longest `q` kept from the URL. */
export const TAREAS_SEARCH_MAX = 200;

export const DEFAULT_TAREAS_QUERY: TareasQuery = {
  tramo: null,
  responsable: null,
  proyecto: null,
  estado: null,
  q: null,
  mostrar: "todas",
  nueva: false,
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

function searchText(value: string | null): string | null {
  const trimmed = value?.trim().slice(0, TAREAS_SEARCH_MAX).trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** URL → query; unknown or malformed values fall back to the defaults. */
export function parseTareasQuery(sp: URLSearchParams): TareasQuery {
  const responsable = sp.get("responsable");
  const estado = sp.get("estado");
  return {
    tramo: key(sp.get("tramo")),
    responsable: responsable === "yo" || responsable === TAREAS_RESPONSABLE_TODOS ? responsable : id(responsable),
    proyecto: id(sp.get("proyecto")),
    estado: estado !== null && (TAREAS_ESTADOS as readonly string[]).includes(estado) ? estado : null,
    q: searchText(sp.get("q")),
    mostrar: pick(sp.get("mostrar"), TAREAS_MOSTRAR, DEFAULT_TAREAS_QUERY.mostrar),
    nueva: sp.get("nueva") === "1",
  };
}

/** `?…` for a partial query (round trip with `parseTareasQuery`). Defaults are left out; "" when nothing is set. */
export function toTareasSearch(q: Partial<TareasQuery>): string {
  const sp = new URLSearchParams();
  if (q.tramo) sp.set("tramo", q.tramo);
  if (q.responsable) sp.set("responsable", q.responsable);
  if (q.proyecto) sp.set("proyecto", q.proyecto);
  if (q.estado) sp.set("estado", q.estado);
  const text = q.q?.trim();
  if (text) sp.set("q", text);
  if (q.mostrar && q.mostrar !== DEFAULT_TAREAS_QUERY.mostrar) sp.set("mostrar", q.mostrar);
  if (q.nueva) sp.set("nueva", "1");
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

/** The query with every filter removed. */
export function clearTareasFilters(): TareasQuery {
  return { ...DEFAULT_TAREAS_QUERY };
}
