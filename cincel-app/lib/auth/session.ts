import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { authCredentials, sessions, teamMembers } from "@/lib/db/schema";
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
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export type SessionUser = {
  id: string;
  legacyId: number | null;
  name: string;
  email: string | null;
  role: string | null;
  area: string | null;
  active: boolean;
  mustChangePassword: boolean;
};

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

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a session row for a team member and set the session cookie.
 * Returns the opaque token (already written to the cookie).
 */
export async function createSession(
  teamMemberId: string,
  userAgent?: string | null
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    teamMemberId,
    userAgent: userAgent ?? null,
    expiresAt,
  });

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
 * there is no cookie, the session is unknown, expired, or the member is gone.
 */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      memberId: teamMembers.id,
      legacyId: teamMembers.legacyId,
      name: teamMembers.name,
      email: teamMembers.institutionalEmail,
      role: teamMembers.role,
      area: teamMembers.area,
      active: teamMembers.active,
      mustChangePassword: authCredentials.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(teamMembers, eq(teamMembers.id, sessions.teamMemberId))
    .leftJoin(authCredentials, eq(authCredentials.teamMemberId, teamMembers.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
        isNull(sessions.deletedAt),
        isNull(teamMembers.deletedAt)
      )
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.sessionId,
    expiresAt: row.expiresAt,
    user: {
      id: row.memberId,
      legacyId: row.legacyId,
      name: row.name,
      email: row.email,
      role: row.role,
      area: row.area,
      active: row.active,
      mustChangePassword: row.mustChangePassword ?? false,
    },
  };
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

/** Delete the current session row and clear the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}
