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
  /**
   * `?completadas=0` hides the completed tasks ("Ocultar completadas", #1039);
   * default true (shown, left out of the URL). "Abiertas" in Mostrar implies hidden.
   */
  completadas?: boolean;
  /**
   * "Incluir apoyo" (#1038): a responsable filter also matches the tasks where
   * that person is apoyo. Default true (left out of the URL); `?apoyo=0` turns it off.
   */
  apoyo?: boolean;
  nueva?: boolean;
};

export const TAREAS_ESTADOS: readonly TaskStatus[] = ["pendiente", "en_proceso", "completado", "bloqueado"];

/** The "Incluir apoyo" search param: `?apoyo=0` matches the Responsable only. */
export const TAREAS_APOYO_PARAM = "apoyo";

/** The "Ocultar completadas" search param: `?completadas=0` hides them. */
export const TAREAS_COMPLETADAS_PARAM = "completadas";

/** Longest `q` kept from the URL. */
export const TAREAS_SEARCH_MAX = 200;

export const DEFAULT_TAREAS_QUERY: TareasQuery = {
  tramo: null,
  responsable: null,
  proyecto: null,
  estado: null,
  q: null,
  mostrar: "todas",
  completadas: true,
  apoyo: true,
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

/** Defaults a URL without the param falls back to (the viewer's preference). */
export type TareasQueryDefaults = {
  /** What a missing `?completadas=` means: false when the viewer hides completed tasks. */
  completadas?: boolean;
};

/** `?completadas=`: "0" hides, "1" shows, missing or anything else is the default. */
export function parseCompletadasParam(value: string | null, fallback = true): boolean {
  if (value === "0") return false;
  if (value === "1") return true;
  return fallback;
}

/**
 * URL → query; unknown or malformed values fall back to the defaults. A
 * missing `?completadas=` uses `defaults.completadas` (the preference).
 */
export function parseTareasQuery(sp: URLSearchParams, defaults: TareasQueryDefaults = {}): TareasQuery {
  const responsable = sp.get("responsable");
  const estado = sp.get("estado");
  return {
    tramo: key(sp.get("tramo")),
    responsable: responsable === "yo" || responsable === TAREAS_RESPONSABLE_TODOS ? responsable : id(responsable),
    proyecto: id(sp.get("proyecto")),
    estado: estado !== null && (TAREAS_ESTADOS as readonly string[]).includes(estado) ? estado : null,
    q: searchText(sp.get("q")),
    mostrar: pick(sp.get("mostrar"), TAREAS_MOSTRAR, DEFAULT_TAREAS_QUERY.mostrar),
    completadas: parseCompletadasParam(sp.get(TAREAS_COMPLETADAS_PARAM), defaults.completadas ?? true),
    apoyo: sp.get(TAREAS_APOYO_PARAM) !== "0",
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
  if (q.completadas === false) sp.set(TAREAS_COMPLETADAS_PARAM, "0");
  if (q.apoyo === false) sp.set(TAREAS_APOYO_PARAM, "0");
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

// ── Ocultar completadas (#1039) ─────────────────────────────────────────────

/**
 * True when the tables hide the completed tasks: the switch is on, or
 * Mostrar narrows to open work ("Abiertas", "En retraso" imply it).
 */
export function isHidingCompleted(q: Pick<TareasQuery, "completadas" | "mostrar">): boolean {
  return q.completadas === false || (q.mostrar !== undefined && q.mostrar !== "todas");
}

/**
 * The Mostrar the loaders filter by: the switch on with "Todas" is
 * "Abiertas" (open = not completado and no closing custom status).
 */
export function effectiveMostrar(q: Pick<TareasQuery, "completadas" | "mostrar">): TareasMostrar {
  const mostrar = q.mostrar ?? "todas";
  return mostrar === "todas" && q.completadas === false ? "abiertas" : mostrar;
}

/**
 * The query patch of the switch: on writes `completadas=0`; off shows the
 * completed tasks again, and a Mostrar that implies hidden goes back to "Todas".
 */
export function hideCompletedPatch(hide: boolean, q: Pick<TareasQuery, "mostrar">): Partial<TareasQuery> {
  if (hide) return { completadas: false };
  return q.mostrar !== undefined && q.mostrar !== "todas" ? { completadas: true, mostrar: "todas" } : { completadas: true };
}

/**
 * Completed tasks a group hides: its count without the switch minus what it
 * shows; never negative.
 */
export function hiddenCompletedCount(all: number, shown: number): number {
  return Math.max(0, all - shown);
}

/** The query with every filter removed. */
export function clearTareasFilters(): TareasQuery {
  return { ...DEFAULT_TAREAS_QUERY };
}
