/**
 * URL state of the Personas contact tabs (Query Migration 6): `?contacto=<id>`
 * opens the contact sheet and `?q=` holds the search. The page stays mounted:
 * the client swaps the params with `history.replaceState`, which the App
 * Router mirrors into `useSearchParams`, so no server render runs.
 */
import type { TeamAnaliticoFilters } from "@/lib/personas/team";
import { readEtapaParam } from "@/lib/ui/etapa-param";

export const CONTACT_PARAM = "contacto";
export const SEARCH_PARAM = "q";
/** Personas · Equipo pill filter: `?estado=libre|cargado|saturado|vacaciones`. */
export const ESTADO_PARAM = "estado";
/** Personas · Equipo expanded person card: `?persona=<staff uuid>`. */
export const PERSONA_PARAM = "persona";

export type EstadoParam = "libre" | "cargado" | "saturado" | "vacaciones";

const ESTADO_VALUES: readonly EstadoParam[] = ["libre", "cargado", "saturado", "vacaciones"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `?estado=` value, or null when absent or unknown. */
export function parseEstadoParam(value: string | null | undefined): EstadoParam | null {
  return ESTADO_VALUES.includes(value as EstadoParam) ? (value as EstadoParam) : null;
}

/** The `?persona=` id when it is a uuid, else null. */
export function parsePersonaParam(value: string | null | undefined): string | null {
  return value && UUID_RE.test(value) ? value : null;
}

/** `pathname` with `key` set to `value` (or removed when null or empty), keeping the other params. */
export function withSearchParam(pathname: string, current: URLSearchParams | null, key: string, value: string | null): string {
  const next = new URLSearchParams(current?.toString() ?? "");
  if (value === null || value === "") next.delete(key);
  else next.set(key, value);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Sets (or removes) one param of the current URL without a navigation. */
export function replaceSearchParam(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  const current = new URLSearchParams(window.location.search);
  window.history.replaceState(null, "", withSearchParam(window.location.pathname, current, key, value));
}

/** The `?contacto=` id of a same-page link (`contactSheetHref`), or null for any other href. */
export function contactIdFromHref(href: string, pathname: string): string | null {
  if (typeof window === "undefined") return null;
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin || url.pathname !== pathname) return null;
  return url.searchParams.get(CONTACT_PARAM);
}

// ── Personas · Analítico (Equipo table) ─────────────────────────────────────


/** `?estado=sobrecargadas|con-capacidad` (Analítico). */
export const ANALITICO_ESTADO_PARAM = "estado";
/** `?etapa=<key>` (old links: `?tramo=`). */
export const TRAMO_PARAM = "etapa";
/** `?alcance=mi-equipo`. */
export const ALCANCE_PARAM = "alcance";
/** `?abiertos=<tramoKey>,<tramoKey>`: the expanded tramo groups (absent = all). */
export const ABIERTOS_PARAM = "abiertos";
/** `?persona=<id>`: the one expanded person. */
export const EXPANDED_PERSON_PARAM = "persona";

export type AnaliticoTeamUrlState = TeamAnaliticoFilters & {
  /** Expanded tramo group ids; null = default (all expanded). */
  abiertos: string[] | null;
  persona: string | null;
};

type ParamsLike = { get(name: string): string | null } | null | undefined;

/** The Analítico filters and expanded state from the URL; unknown values fall back to the defaults. */
export function parseAnaliticoTeamParams(params: ParamsLike): AnaliticoTeamUrlState {
  const estadoRaw = params?.get(ANALITICO_ESTADO_PARAM) ?? null;
  const estado: TeamAnaliticoFilters["estado"] =
    estadoRaw === "sobrecargadas" || estadoRaw === "con-capacidad" ? estadoRaw : "todas";
  const tramo = readEtapaParam(params)?.trim() || null;
  const alcance: TeamAnaliticoFilters["alcance"] = params?.get(ALCANCE_PARAM) === "mi-equipo" ? "mi-equipo" : "todo";
  const q = params?.get(SEARCH_PARAM) ?? "";
  const abiertosRaw = params?.get(ABIERTOS_PARAM);
  const abiertos =
    abiertosRaw === null || abiertosRaw === undefined
      ? null
      : abiertosRaw
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
  const persona = params?.get(EXPANDED_PERSON_PARAM)?.trim() || null;
  return { estado, tramo, alcance, q, abiertos, persona };
}

/** `pathname` with several params set (null or empty removes one), keeping the others. */
export function withSearchParams(
  pathname: string,
  current: URLSearchParams | null,
  updates: Record<string, string | null>,
): string {
  const next = new URLSearchParams(current?.toString() ?? "");
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Sets (or removes) several params of the current URL without a navigation. */
export function replaceSearchParams(updates: Record<string, string | null>): void {
  if (typeof window === "undefined") return;
  const current = new URLSearchParams(window.location.search);
  window.history.replaceState(null, "", withSearchParams(window.location.pathname, current, updates));
}

/** The URL params of an Analítico state (defaults removed). `abiertos: []` is written as ",". */
export function analiticoTeamParams(state: AnaliticoTeamUrlState): Record<string, string | null> {
  return {
    [ANALITICO_ESTADO_PARAM]: state.estado === "todas" ? null : state.estado,
    [TRAMO_PARAM]: state.tramo,
    [ALCANCE_PARAM]: state.alcance === "mi-equipo" ? "mi-equipo" : null,
    [SEARCH_PARAM]: state.q.trim() ? state.q : null,
    [ABIERTOS_PARAM]: state.abiertos === null ? null : state.abiertos.length === 0 ? "," : state.abiertos.join(","),
    [EXPANDED_PERSON_PARAM]: state.persona,
  };
}
