/**
 * URL state of the Personas contact tabs (Query Migration 6): `?contacto=<id>`
 * opens the contact sheet and `?q=` holds the search. The page stays mounted:
 * the client swaps the params with `history.replaceState`, which the App
 * Router mirrors into `useSearchParams`, so no server render runs.
 */
export const CONTACT_PARAM = "contacto";
export const SEARCH_PARAM = "q";

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
