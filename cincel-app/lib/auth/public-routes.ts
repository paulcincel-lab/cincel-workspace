/**
 * Single source of the routes that render without a staff session. Imported by
 * `proxy.ts` and `AppRouteGuard` (client), so it must stay
 * free of server-only and browser-only imports.
 */

export const LOGIN_ROUTE = "/login";
export const LOGIN_DENIED_ROUTE = "/login/denegado";
export const CHANGE_PASSWORD_ROUTE = "/change-password";
export const PORTAL_ROUTE = "/portal";
export const PORTAL_LOGIN_ROUTE = "/portal/login";
/** Magic-link landing page: the link in the email opens it before any portal cookie exists. */
export const PORTAL_ACCESS_ROUTE = "/portal/acceder";

/**
 * Sign-out route (§A.5.1): deletes the staff session row and cookie, then
 * redirects to `next`. Used when a staff cookie may still exist but the server
 * resolved the request as a guest, so the browser never bounces between a
 * protected page and `/login` with a stale cookie.
 */
export const SIGN_OUT_TO_LOGIN_URL = `/api/auth/signout?next=${encodeURIComponent(LOGIN_ROUTE)}`;

const PUBLIC_STAFF_ROUTES: ReadonlySet<string> = new Set([LOGIN_ROUTE, LOGIN_DENIED_ROUTE, CHANGE_PASSWORD_ROUTE]);

/** `/portal` and every path under it: the portal layout does its own checks. */
export function isPortalPath(pathname: string): boolean {
  return pathname === PORTAL_ROUTE || pathname.startsWith(`${PORTAL_ROUTE}/`);
}

const PUBLIC_PORTAL_ROUTES: ReadonlySet<string> = new Set([PORTAL_LOGIN_ROUTE, PORTAL_ACCESS_ROUTE]);

/** Portal paths that render without a portal session (sign-in and the magic-link landing page). */
export function isPublicPortalPath(pathname: string): boolean {
  return PUBLIC_PORTAL_ROUTES.has(pathname);
}

/** True for paths that never require a staff session. */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_STAFF_ROUTES.has(pathname) || isPortalPath(pathname);
}
