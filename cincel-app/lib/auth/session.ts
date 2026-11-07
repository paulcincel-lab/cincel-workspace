import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { staffAccessRole } from "@/lib/auth/access-role";
import { accessRecheckHours, isAccessCheckDue, recheckStaffAccess } from "@/lib/auth/access-recheck";
import * as authRepository from "@/lib/repositories/auth-repository";
import type { SessionStaffAccess, SessionUser as RepoSessionUser } from "@/lib/repositories/auth-repository";
import type { SystemAccessRole } from "@/lib/data/roles";

import { SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { CHANGE_PASSWORD_ROUTE, LOGIN_ROUTE } from "@/lib/auth/public-routes";

export { SESSION_COOKIE };

export type SessionUser = RepoSessionUser;

export type Session = {
  id: string;
  user: SessionUser;
  expiresAt: Date;
  /** Re-check state of the staff row (BE §A.5); server only, never sent to the browser. */
  staffAccess: SessionStaffAccess;
};

/**
 * Where the session helpers send a staff member whose access is gone (BE
 * §A.5.1). The sign-out route clears the cookie, then shows the denial page.
 */
export const SIGNOUT_REVOKED_PATH = "/api/auth/signout?next=%2Flogin%2Fdenegado%3Fmotivo%3Drevoked";
export const SIGNOUT_INACTIVE_PATH = "/api/auth/signout?next=%2Flogin%2Fdenegado%3Fmotivo%3Dinactive";

export type SessionAccessStatus =
  | "guest"
  | "inactive_member"
  | "no_system_access"
  | "pending_first_access"
  | "active";

export type SessionAccess = {
  status: SessionAccessStatus;
  user:
    | (SessionUser & { access: SystemAccessRole })
    | null;
};

/**
 * Server-side equivalent of the legacy `resolveCurrentSessionAccess()` — maps
 * the current request's session to an access decision + role for the route
 * guard. Safe to call in Server Components / layout.
 */
export async function getSessionAccess(): Promise<SessionAccess> {
  const session = await getCheckedSession();
  if (!session) return { status: "guest", user: null };

  const access = staffAccessRole(session.user.role, session.user.email);
  if (!access) return { status: "no_system_access", user: null };

  const user = { ...session.user, access };
  // Google staff have no password state (BE §A.4): never forced to /change-password.
  if (session.user.mustChangePassword && !session.user.googleLinked) {
    return { status: "pending_first_access", user };
  }
  return { status: "active", user };
}

/**
 * Create a session row for a staff member and set the session cookie.
 * Returns the opaque token (already written to the cookie).
 */
export async function createSession(
  staffId: string,
  userAgent?: string | null
): Promise<string> {
  const { token, expiresAt } = await authRepository.createSessionRecord(staffId, userAgent);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  // Appearance cookie from the DB row at sign-in (redesign BE §8.2); never fails the sign-in.
  const { writeAppearanceCookieForStaff } = await import("@/lib/ui/preferences-server");
  await writeAppearanceCookieForStaff(staffId);

  return token;
}

/**
 * Resolve the current request's session from the cookie. Returns `null` when
 * there is no cookie, the session is unknown, expired, or the staff member
 * is gone.
 */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const record = await authRepository.findSessionByToken(token);
  if (!record) return null;

  return { id: record.id, expiresAt: record.expiresAt, user: record.user, staffAccess: record.staffAccess };
}

/**
 * The current session after the access checks (BE §A.5):
 * - `access_revoked_at` set or `active = false`: the staff member's sessions
 *   are deleted and the request redirects through `/api/auth/signout` to
 *   `/login/denegado` (`motivo=revoked` / `inactive`)
 * - Google-linked and the re-check is due: the request that claims it asks
 *   the Directory; a revoke redirects the same way, a Directory error keeps
 *   access (the re-check backs off on its own)
 *
 * `redirect()` throws; route handlers that turn a thrown helper into a 401
 * keep doing so.
 */
async function getCheckedSession(): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;

  if (session.staffAccess.accessRevokedAt || !session.user.active) {
    await authRepository.deleteStaffSessions(session.user.id);
    redirect(session.staffAccess.accessRevokedAt ? SIGNOUT_REVOKED_PATH : SIGNOUT_INACTIVE_PATH);
  }

  const { googleSub, accessCheckedAt } = session.staffAccess;
  if (!googleSub || !isAccessCheckDue(accessCheckedAt, accessRecheckHours())) return session;

  let outcome;
  try {
    outcome = await recheckStaffAccess(session.user.id);
  } catch (error) {
    // An unexpected failure must not take every page down; the next request retries.
    console.error("[access-recheck] unexpected error", error);
    return session;
  }
  if (outcome.status === "revoked") redirect(SIGNOUT_REVOKED_PATH);
  // Role and áreas may have changed.
  if (outcome.status === "kept") return getSession();
  return session;
}

/**
 * Require an active session or throw. Use at the top of Server Actions.
 * Revoked or deactivated staff are redirected to sign-out (see `getCheckedSession`).
 */
export async function requireSession(): Promise<Session> {
  const session = await getCheckedSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  return session;
}

/**
 * Require an active session with system access, returning the user + resolved
 * access role. Use at the top of Server Actions that run capability checks.
 */
export async function requireSessionAccess(): Promise<
  NonNullable<SessionAccess["user"]>
> {
  const access = await getSessionAccess();
  if (!access.user || access.status === "no_system_access") {
    throw new Error("FORBIDDEN");
  }
  return access.user;
}

/**
 * Require an active session and adapt it to the `AuthenticatedUser` shape the
 * capability resolvers in `lib/auth/permissions.ts` expect. Server Actions call
 * this and hand the result to `resolve<Module>Capabilities()`.
 */
export async function requireCapabilityUser(): Promise<
  import("@/lib/auth/auth-service").AuthenticatedUser
> {
  return toCapabilityUser(await requireSessionAccess());
}

function toCapabilityUser(
  user: NonNullable<SessionAccess["user"]>,
): import("@/lib/auth/auth-service").AuthenticatedUser {
  return {
    member: {
      id: user.id,
      name: user.name,
      role: user.role ?? "",
      area: user.area ?? "",
      capacity: 0,
      availability: "",
      active: user.active,
      institutionalEmail: user.email ?? "",
      phone: "",
    },
    email: user.email ?? "",
    access: user.access,
  };
}

/**
 * Page guard of the redesign's admin settings segments (redesign BE §12.2, FE §8):
 * one `app/(staff)/ajustes/(admin)/<segment>/layout.tsx` per segment calls it
 * with that segment's capability. A viewer without it gets `notFound()` (no
 * redirect, no hint that the page exists); a guest is sent to `/login` and a
 * first-access account to `/change-password`, like the `(staff)` layout.
 * Returns the capability user so the page can run its own section checks.
 */
export async function requirePageCapability(
  cap: (user: import("@/lib/auth/auth-service").AuthenticatedUser) => boolean,
): Promise<import("@/lib/auth/auth-service").AuthenticatedUser> {
  const access = await getSessionAccess();
  if (access.status === "guest") redirect(LOGIN_ROUTE);
  if (access.status === "pending_first_access") redirect(CHANGE_PASSWORD_ROUTE);
  if (access.status !== "active" || !access.user) notFound();

  const user = toCapabilityUser(access.user);
  if (!cap(user)) notFound();
  return user;
}

/** Delete the current session row and clear the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await authRepository.deleteSessionByToken(token);
  }
  jar.delete(SESSION_COOKIE);
}
