/**
 * Pure URL helpers of `/mejoras` (#1114, #1115): the query string is the
 * shareable state (filters and the open solicitud), and these functions are
 * the only place that edits it.
 */

/** The query string without the leading `?`, after `mutate` edited a copy of `search`. */
export function editSearch(search: string, mutate: (params: URLSearchParams) => void): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  mutate(params);
  return params.toString();
}

/** `pathname` + `?search` (when not empty) + `hash`. */
export function buildUrl(pathname: string, search: string, hash = ""): string {
  return `${pathname}${search ? `?${search}` : ""}${hash}`;
}

/** The value of `name` in `search`, or null when absent or empty. */
export function readParam(search: string, name: string): string | null {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(name) || null;
}
