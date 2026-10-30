/**
 * Single source of the routes that render without a staff session. Imported by
 * `middleware.ts` (edge runtime) and `AppRouteGuard` (client), so it must stay
 * free of server-only and browser-only imports.
 */

export const LOGIN_ROUTE = "/login";
export const LOGIN_DENIED_ROUTE = "/login/denegado";
export const CHANGE_PASSWORD_ROUTE = "/change-password";
export const PORTAL_ROUTE = "/portal";

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

/** True for paths that never require a staff session. */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_STAFF_ROUTES.has(pathname) || isPortalPath(pathname);
}
