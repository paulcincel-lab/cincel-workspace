/**
 * Session cookie name. Kept in its own module (no server-only / node imports)
 * so `middleware.ts` (edge runtime) can import it.
 */
export const SESSION_COOKIE = "cincel_session";

/** Portal (client) session cookie (backend spec §B.2). Never read by the staff session helpers. */
export const PORTAL_SESSION_COOKIE = "cincel_portal_session";
