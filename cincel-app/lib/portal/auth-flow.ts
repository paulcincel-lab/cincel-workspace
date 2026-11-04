import { createRateLimiter } from "@/lib/auth/rate-limit";
import { isPortalPath, PORTAL_LOGIN_ROUTE, PORTAL_ROUTE } from "@/lib/auth/public-routes";
import { safeReturnTo } from "@/lib/auth/safe-return-to";

/**
 * Pure pieces of the portal magic-link sign-in (#506): rate limiters, input
 * checks, `return_to` handling and the response copy. No database access, so
 * the routes and the tests share it.
 */

/** `POST /api/portal/auth/link`: 5 per hour per email. */
export const portalLinkEmailRateLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });
/** `POST /api/portal/auth/link`: 20 per hour per IP. */
export const portalLinkIpRateLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });
/** `POST /api/portal/auth/verify`: 10 per 15 minutes per IP. */
export const portalVerifyIpRateLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

/** The same answer for known, unknown and disabled emails (§B.8 #2). */
export const PORTAL_LINK_SENT_MESSAGE = "Si tu correo tiene acceso, te enviamos un enlace.";
export const PORTAL_RATE_LIMITED_MESSAGE = "Demasiados intentos, espera unos minutos.";
export const PORTAL_LINK_INVALID_MESSAGE = "El enlace ya no es válido. Pide uno nuevo.";

/** Where an expired, used or unknown link sends the client. */
export const PORTAL_LINK_ERROR_PATH = `${PORTAL_LOGIN_ROUTE}?error=link`;
export const PORTAL_ACCESS_PATH = "/portal/acceder";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** `newPortalToken()` output: 32 random bytes as hex. */
const TOKEN = /^[0-9a-f]{64}$/;

/** Lowercased, trimmed email, or null when it isn't one. */
export function normalizePortalEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !EMAIL.test(email)) return null;
  return email;
}

/** The token when it has the shape we issue; anything else can't match a row, so it is rejected early. */
export function parsePortalLinkToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  return TOKEN.test(token) ? token : null;
}

/**
 * A safe portal return target: `safeReturnTo` plus "stays inside /portal",
 * so a portal link never lands on a staff page. Null when absent or unsafe.
 */
export function portalReturnTo(value: unknown): string | null {
  const target = safeReturnTo(value, "");
  if (!target) return null;
  const path = target.split(/[?#]/, 1)[0];
  return isPortalPath(path) ? target : null;
}

/** Where a successful verify goes: the stored `return_to`, re-checked, or `/portal`. */
export function portalSignInTarget(returnTo: string | null | undefined): string {
  return portalReturnTo(returnTo) ?? PORTAL_ROUTE;
}

/** The link in the email: `${origin}/portal/acceder?token=…`. */
export function portalAccessUrl(origin: string, token: string): string {
  return `${origin}${PORTAL_ACCESS_PATH}?token=${encodeURIComponent(token)}`;
}
