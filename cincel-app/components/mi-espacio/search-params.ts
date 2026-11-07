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
