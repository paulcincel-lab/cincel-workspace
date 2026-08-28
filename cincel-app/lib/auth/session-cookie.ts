/**
 * Session cookie name. Kept in its own module (no server-only / node imports)
 * so `middleware.ts` (edge runtime) can import it.
 */
export const SESSION_COOKIE = "cincel_session";
