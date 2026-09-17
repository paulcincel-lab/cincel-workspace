import "server-only";

import { cookies } from "next/headers";

import * as authRepository from "@/lib/repositories/auth-repository";
import type { SessionUser as RepoSessionUser } from "@/lib/repositories/auth-repository";
import {
  DEFAULT_SYSTEM_ACCESS_ROLE,
  hasDefaultSystemAdministratorAccess,
  isAdministratorRole,
  isLegacyBlockedAccessRole,
  normalizeSystemAccessRole,
  SYSTEM_ACCESS_ROLES,
  SYSTEM_ADMIN_ROLE,
  type SystemAccessRole,
} from "@/lib/data/roles";

import { SESSION_COOKIE } from "@/lib/auth/session-cookie";

export { SESSION_COOKIE };

export type SessionUser = RepoSessionUser;

export type Session = {
  id: string;
  user: SessionUser;
  expiresAt: Date;
};

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

function resolveAccessRole(
  role: string | null,
  email: string | null
): SystemAccessRole | null {
  if (isLegacyBlockedAccessRole(role)) return null;
  const normalized = normalizeSystemAccessRole(role);
  if (normalized && SYSTEM_ACCESS_ROLES.includes(normalized)) return normalized;
  if (isAdministratorRole(role) || hasDefaultSystemAdministratorAccess(email)) {
    return SYSTEM_ADMIN_ROLE;
  }
  return DEFAULT_SYSTEM_ACCESS_ROLE;
}

/**
 * Server-side equivalent of the legacy `resolveCurrentSessionAccess()` — maps
 * the current request's session to an access decision + role for the route
 * guard. Safe to call in Server Components / layout.
 */
export async function getSessionAccess(): Promise<SessionAccess> {
  const session = await getSession();
  if (!session) return { status: "guest", user: null };
  if (!session.user.active) return { status: "inactive_member", user: null };

  const access = resolveAccessRole(session.user.role, session.user.email);
  if (!access) return { status: "no_system_access", user: null };

  const user = { ...session.user, access };
  if (session.user.mustChangePassword) {
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

  return { id: record.id, expiresAt: record.expiresAt, user: record.user };
}

/**
 * Require an active session or throw. Use at the top of Server Actions.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session || !session.user.active) {
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
  const user = await requireSessionAccess();
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

/** Delete the current session row and clear the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await authRepository.deleteSessionByToken(token);
  }
  jar.delete(SESSION_COOKIE);
}
