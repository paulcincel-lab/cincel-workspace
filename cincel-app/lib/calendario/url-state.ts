/**
 * Calendario URL state (FE §2.4). Client-safe. `vista` and `fecha` are URL
 * state, not store state: they are shareable and survive a reload.
 */
import { rangeOf } from "@/lib/calendario/range";
import type { CalMostrar, CalView, CalendarioFilters, CalendarioQuery } from "@/lib/types/calendario";

export const CALENDARIO_PATH = "/calendario";

const VISTAS: readonly CalView[] = ["dia", "semana", "mes"];
const MOSTRAR: readonly CalMostrar[] = ["todo", "tareas", "reuniones"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM = /^[et]:[0-9a-f-]{36}$/i;

/** What the URL does not say: the Estilo's default vista, today and the hide-completed preference. */
export type CalendarioQueryDefaults = {
  vista?: CalView;
  /** Today in the org time zone; defaults to the UTC date. */
  today?: string;
  ocultarCompletadas?: boolean;
};

export const DEFAULT_CALENDARIO_FILTERS: CalendarioFilters = {
  mostrar: "todo",
  quien: "yo",
  proyectos: [],
  tramo: null,
  responsable: null,
  apoyo: true,
  ocultarCompletadas: false,
};

type SearchInput = string | URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;

function paramsOf(search: SearchInput): URLSearchParams {
  if (!search) return new URLSearchParams();
  if (typeof search === "string") return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (search instanceof URLSearchParams) return search;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}

/** Filters with defaults filled, ids sorted and de-duplicated (the form that enters a query key). */
export function normalizeCalendarioFilters(
  filters?: Partial<CalendarioFilters>,
  defaults?: Pick<CalendarioQueryDefaults, "ocultarCompletadas">,
): CalendarioFilters {
  const base = { ...DEFAULT_CALENDARIO_FILTERS, ocultarCompletadas: defaults?.ocultarCompletadas ?? false };
  const merged = { ...base, ...filters };
  return {
    mostrar: MOSTRAR.includes(merged.mostrar) ? merged.mostrar : "todo",
    quien: merged.quien === "todos" ? "todos" : "yo",
    proyectos: [...new Set(merged.proyectos ?? [])].sort(),
    tramo: merged.tramo || null,
    // `responsable` only makes sense for "todos".
    responsable: merged.quien === "todos" ? merged.responsable || null : null,
    apoyo: merged.apoyo !== false,
    ocultarCompletadas: merged.ocultarCompletadas === true,
  };
}

/** Parses `location.search` (or Next's `searchParams`) into the Calendario query. Unknown values fall back to defaults. */
export function parseCalendarioQuery(search: SearchInput, defaults: CalendarioQueryDefaults = {}): CalendarioQuery {
  const p = paramsOf(search);
  const vistaParam = p.get("vista") as CalView | null;
  const vista = vistaParam && VISTAS.includes(vistaParam) ? vistaParam : (defaults.vista ?? "semana");
  const fechaParam = p.get("fecha");
  const today = defaults.today ?? new Date().toISOString().slice(0, 10);
  const fecha = fechaParam && DATE.test(fechaParam) ? fechaParam : today;
  const mostrar = p.get("mostrar") as CalMostrar | null;
  const ocultar = p.get("ocultar");
  const proyectos = (p.get("proyectos") ?? "").split(",").filter((id) => UUID.test(id));
  const quien = p.get("quien") === "todos" ? "todos" : "yo";
  const evento = p.get("evento");
  const tarea = p.get("tarea");
  const propuesta = p.get("propuesta");
  return {
    vista,
    fecha,
    filters: normalizeCalendarioFilters(
      {
        mostrar: mostrar && MOSTRAR.includes(mostrar) ? mostrar : "todo",
        quien,
        proyectos,
        tramo: p.get("tramo"),
        responsable: p.get("responsable"),
        apoyo: p.get("apoyo") !== "0",
        ocultarCompletadas: ocultar === "1" ? true : ocultar === "0" ? false : (defaults.ocultarCompletadas ?? false),
      },
      defaults,
    ),
    modo: p.get("modo") === "planear" ? "planear" : null,
    evento: evento && ITEM.test(evento) ? evento : null,
    tarea: tarea && UUID.test(tarea) ? tarea : null,
    propuesta: propuesta && UUID.test(propuesta) ? propuesta : null,
    nueva: p.get("nueva") === "reunion" ? "reunion" : null,
  };
}

/**
 * The search string of a query (no leading "?"). Values equal to their default
 * are left out; `estilo` is not part of it (the caller keeps it).
 */
export function toCalendarioSearch(q: CalendarioQuery, defaults: CalendarioQueryDefaults = {}): string {
  const p = new URLSearchParams();
  const f = normalizeCalendarioFilters(q.filters, defaults);
  if (q.vista !== (defaults.vista ?? "semana")) p.set("vista", q.vista);
  const today = defaults.today ?? new Date().toISOString().slice(0, 10);
  if (q.fecha !== today) p.set("fecha", q.fecha);
  if (f.mostrar !== "todo") p.set("mostrar", f.mostrar);
  if (f.quien !== "yo") p.set("quien", f.quien);
  if (f.proyectos.length) p.set("proyectos", f.proyectos.join(","));
  if (f.tramo) p.set("tramo", f.tramo);
  if (f.responsable) p.set("responsable", f.responsable);
  if (!f.apoyo) p.set("apoyo", "0");
  if (f.ocultarCompletadas !== (defaults.ocultarCompletadas ?? false)) p.set("ocultar", f.ocultarCompletadas ? "1" : "0");
  if (q.modo) p.set("modo", q.modo);
  if (q.evento) p.set("evento", q.evento);
  if (q.tarea) p.set("tarea", q.tarea);
  if (q.propuesta) p.set("propuesta", q.propuesta);
  if (q.nueva) p.set("nueva", q.nueva);
  return p.toString();
}

/** `/calendario?…` for a query. */
export function calendarioHref(q: CalendarioQuery, defaults: CalendarioQueryDefaults = {}): string {
  const search = toCalendarioSearch(q, defaults);
  return search ? `${CALENDARIO_PATH}?${search}` : CALENDARIO_PATH;
}

/** The range input of a query, for `qk.calendario.range` and the loader. */
export function rangeInputOf(q: CalendarioQuery) {
  return { view: q.vista, ...rangeOf(q.vista, q.fecha), filters: q.filters };
}
