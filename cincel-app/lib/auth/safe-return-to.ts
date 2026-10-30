/**
 * Open-redirect-safe return targets (backend spec §A.10). Every `return_to` /
 * `next` value, staff and portal, goes through `safeReturnTo()` before it is
 * used in a redirect.
 *
 * No `server-only` import: it is pure and has no secrets, so route handlers,
 * server code and tests share it.
 */

type Env = Record<string, string | undefined>;

/** Default fallback: the staff home. Sign-out uses `/login`, the portal `/portal`. */
export const DEFAULT_RETURN_TO = "/dashboard";

// Used only to resolve relative paths when APP_ORIGIN isn't configured. A
// path that passes the shape checks can't change the origin it resolves
// against, so the check stays equivalent; nothing is ever redirected here.
const CHECK_ORIGIN_FALLBACK = "http://app.invalid";

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * The app's public origin from `APP_ORIGIN` (e.g. `https://app.cincel.mx`),
 * normalised by `URL`. Null when it's unset or isn't an http(s) URL. Redirect
 * targets and OAuth redirect URIs are built from it, never from the request host.
 */
export function getAppOrigin(env: Env = process.env): string | null {
  const raw = env.APP_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * `value` when it's a same-origin path, otherwise `fallback`. The value must
 * start with a single `/` (not `//` or `/\`), contain no control characters,
 * and resolve against `APP_ORIGIN` to that same origin. The result is the
 * normalised path, query and hash, never an absolute URL.
 */
export function safeReturnTo(value: unknown, fallback: string = DEFAULT_RETURN_TO, env: Env = process.env): string {
  if (typeof value !== "string" || value === "") return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (CONTROL_CHARS.test(value)) return fallback;

  const origin = getAppOrigin(env) ?? CHECK_ORIGIN_FALLBACK;
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return fallback;
  }
  if (url.origin !== origin) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}
