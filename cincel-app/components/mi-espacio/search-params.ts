/**
 * Search params of /mi-espacio (redesign FE §2.1, §3.3): `?nota=<id>` (or
 * `nueva`) opens `NoteEditor` and `?correo=<threadId>` opens the Gmail
 * reading pane (the Bandeja tab param lives in `lib/my-space/inbox.ts`). The
 * page stays mounted: the client swaps the params with
 * `history.replaceState`, which the App Router mirrors into `useSearchParams`.
 */
export const NOTE_PARAM = "nota";
export const NEW_NOTE = "nueva";
export const THREAD_PARAM = "correo";

/** `/mi-espacio` with `key` set to `value` (or removed when null), keeping the other params. */
export function miEspacioHref(current: URLSearchParams | null, key: string, value: string | null): string {
  const next = new URLSearchParams(current?.toString() ?? "");
  if (value === null) next.delete(key);
  else next.set(key, value);
  const query = next.toString();
  return query ? `/mi-espacio?${query}` : "/mi-espacio";
}

/** Sets (or removes) one param of the current URL without a navigation. */
export function replaceMiEspacioParam(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  const current = new URLSearchParams(window.location.search);
  window.history.replaceState(null, "", miEspacioHref(current, key, value));
}

// ── Analítico filters (`MiEspacioAnalitico`) ────────────────────────────────

/** `?estado=retraso` shows only overdue tasks; absent = every open task ("Abiertas"). */
export const ESTADO_PARAM = "estado";
export const ESTADO_RETRASO = "retraso";
/** `?tramo=<key>`: tasks of one tramo; absent = every tramo. */
export const TRAMO_PARAM = "tramo";
/** `?q=`: searches task, checklist and notification titles. */
export const SEARCH_PARAM = "q";
/** `?abiertos=<projectId>,<projectId>`: the expanded project groups; absent = all, empty = none. */
export const ABIERTOS_PARAM = "abiertos";

export type MiEspacioEstado = "abiertas" | "retraso";

export type MiEspacioFilters = {
  estado: MiEspacioEstado;
  tramo: string | null;
  q: string;
  /** Expanded project ids; null = every project. */
  abiertos: string[] | null;
};

/** The Analítico filters of a query string; unknown values fall back to the defaults. */
export function parseMiEspacioFilters(params: URLSearchParams | null): MiEspacioFilters {
  const abiertos = params?.get(ABIERTOS_PARAM) ?? null;
  return {
    estado: params?.get(ESTADO_PARAM) === ESTADO_RETRASO ? "retraso" : "abiertas",
    tramo: params?.get(TRAMO_PARAM) || null,
    q: params?.get(SEARCH_PARAM) ?? "",
    abiertos: abiertos === null ? null : abiertos.split(",").filter(Boolean),
  };
}

/** `?abiertos=` value: null (param removed) = all expanded, "" = none. */
export function abiertosParam(ids: readonly string[] | null): string | null {
  return ids === null ? null : ids.join(",");
}
