import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { safeReturnTo } from "@/lib/auth/safe-return-to";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { isPortalNotFound, PortalNotFoundError } from "@/lib/portal/drive-guard";
import {
  deletePortalSessionByTokenHash,
  findActivePortalSession,
  findPortalProjectAccess,
  hashPortalToken,
  insertPortalSession,
  newPortalToken,
  PORTAL_SESSION_REFRESH_MS,
  PORTAL_SESSION_TTL_MS,
  slidePortalSession,
  type PortalProjectAccess,
} from "@/lib/portal/session-store";

/**
 * Portal (client) sessions (BE §B.2, §B.4.3). Reads and writes only the
 * `cincel_portal_session` cookie and `portal_sessions`; the staff cookie is
 * never looked at, so a staff session is never a portal session and a portal
 * token sent as the staff cookie matches no staff session.
 *
 * - Pages and layouts: `requirePortalUser()` / `requireProjectAccess(pid)`.
 *   No session → redirect through `/api/portal/auth/logout?next=/portal/login`
 *   (Server Components can't clear cookies); no access → `notFound()`.
 * - `/api/portal/*` routes: `requirePortalApiUser()` /
 *   `requireProjectAccess(pid, user)` throw, and `portalErrorResponse(error)`
 *   turns that into 401 `{ redirect }` (cookie cleared) or 404.
 */

export { PORTAL_SESSION_COOKIE, PORTAL_SESSION_TTL_MS, PORTAL_SESSION_REFRESH_MS };
export type { PortalProjectAccess };

export const PORTAL_LOGIN_PATH = "/portal/login";
export const PORTAL_LOGOUT_ROUTE = "/api/portal/auth/logout";

export type PortalUser = { id: string; name: string; email: string; contactId: string };

/** The logout route that drops the cookie, then redirects to a safe `next` (default `/portal/login`). */
export function portalSignOutPath(next: string = PORTAL_LOGIN_PATH): string {
  return `${PORTAL_LOGOUT_ROUTE}?next=${encodeURIComponent(safeReturnTo(next, PORTAL_LOGIN_PATH))}`;
}

export class PortalUnauthorizedError extends Error {
  readonly status = 401;

  constructor() {
    super("PORTAL_UNAUTHENTICATED");
    this.name = "PortalUnauthorizedError";
  }
}

export function isPortalUnauthorized(error: unknown): error is PortalUnauthorizedError {
  return error instanceof PortalUnauthorizedError;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/**
 * Creates a 30-day session for an active portal user and sets the portal
 * cookie. For route handlers (the verify route); returns the raw token.
 */
export async function createPortalSession(
  portalUserId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = newPortalToken();
  const expiresAt = new Date(Date.now() + PORTAL_SESSION_TTL_MS);
  await insertPortalSession({
    tokenHash: hashPortalToken(token),
    portalUserId,
    expiresAt,
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });
  const jar = await cookies();
  jar.set(PORTAL_SESSION_COOKIE, token, cookieOptions(expiresAt));
  return { token, expiresAt };
}

/** Deletes the current portal session row (if any) and clears the portal cookie. For route handlers. */
export async function destroyPortalSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (token) await deletePortalSessionByTokenHash(hashPortalToken(token));
  jar.delete(PORTAL_SESSION_COOKIE);
}

/**
 * The signed-in portal user, or null when there is no portal cookie, the
 * session is unknown or expired, or the user isn't `active`. Slides the
 * expiry to now + 30 days when it was last refreshed more than 24 h ago.
 */
export async function getPortalUser(): Promise<PortalUser | null> {
  const jar = await cookies();
  const token = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return null;

  const now = new Date();
  const record = await findActivePortalSession(hashPortalToken(token), now);
  if (!record) return null;

  if (now.getTime() - record.refreshedAt.getTime() > PORTAL_SESSION_REFRESH_MS) {
    const expiresAt = new Date(now.getTime() + PORTAL_SESSION_TTL_MS);
    await slidePortalSession(record.sessionId, now, expiresAt);
    try {
      jar.set(PORTAL_SESSION_COOKIE, token, cookieOptions(expiresAt));
    } catch {
      // Server Components can't set cookies; middleware re-issues the cookie on every portal page request.
    }
  }
  return record.user;
}

/** Pages and layouts: the portal user, or a redirect that clears the cookie and lands on `/portal/login`. */
export async function requirePortalUser(): Promise<PortalUser> {
  const user = await getPortalUser();
  if (!user) redirect(portalSignOutPath());
  return user;
}

/** `/api/portal/*` routes: the portal user, or a thrown PortalUnauthorizedError (see `portalErrorResponse`). */
export async function requirePortalApiUser(): Promise<PortalUser> {
  const user = await getPortalUser();
  if (!user) throw new PortalUnauthorizedError();
  return user;
}

/**
 * The project, when the user has an active access row and the project is
 * neither soft-deleted nor `cancelado`. Never 403: without access it is a
 * 404. Without `user` (pages) it resolves the user with `requirePortalUser()`
 * and calls `notFound()`; with `user` (API routes) it throws
 * PortalNotFoundError.
 */
export async function requireProjectAccess(projectId: string, user?: PortalUser): Promise<PortalProjectAccess> {
  const page = !user;
  const portalUser = user ?? (await requirePortalUser());
  const access = UUID.test(projectId) ? await findPortalProjectAccess(portalUser.id, projectId) : null;
  if (!access) {
    if (page) notFound();
    throw new PortalNotFoundError();
  }
  return access;
}

/** 401 `{ redirect: "/portal/login" }` with the portal cookie cleared on the response. */
export function portalUnauthorizedResponse(): NextResponse {
  const response = NextResponse.json({ redirect: PORTAL_LOGIN_PATH }, { status: 401 });
  response.cookies.set(PORTAL_SESSION_COOKIE, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
  return response;
}

/**
 * Maps the portal helpers' errors to a response for `/api/portal/*` routes:
 * 401 for no session, 404 for no access or a Drive id outside the client
 * folder. Null for anything else, which the route rethrows.
 */
export function portalErrorResponse(error: unknown): NextResponse | null {
  if (isPortalUnauthorized(error)) return portalUnauthorizedResponse();
  if (isPortalNotFound(error)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return null;
}
