import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { sessions, teamMembers } from "@/lib/db/schema";

export const SESSION_COOKIE = "cincel_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export type SessionUser = {
  id: string;
  legacyId: number | null;
  name: string;
  email: string | null;
  role: string | null;
  area: string | null;
  active: boolean;
};

export type Session = {
  id: string;
  user: SessionUser;
  expiresAt: Date;
};

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
    })
    .from(sessions)
    .innerJoin(teamMembers, eq(teamMembers.id, sessions.teamMemberId))
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

/** Delete the current session row and clear the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}
