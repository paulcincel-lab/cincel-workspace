/**
 * Session cookie name. Kept in its own module (no server-only / node imports)
 * so `middleware.ts` (edge runtime) can import it.
 */
export const SESSION_COOKIE = "cincel_session";

/** Portal (client) session cookie (backend spec §B.2). Never read by the staff session helpers. */
export const PORTAL_SESSION_COOKIE = "cincel_portal_session";

/**
 * Portal session lifetime in seconds (30 days, sliding). Middleware re-issues the portal cookie with this max-age on
 * every protected portal page request, because Server Components can't set cookies; the DB row stays the source of
 * truth for expiry.
 */
export const PORTAL_SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
