/**
 * URL state of the Personas contact tabs (Query Migration 6): `?contacto=<id>`
 * opens the contact sheet and `?q=` holds the search. The page stays mounted:
 * the client swaps the params with `history.replaceState`, which the App
 * Router mirrors into `useSearchParams`, so no server render runs.
 */
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
