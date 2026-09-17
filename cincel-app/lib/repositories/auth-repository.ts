import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { authCredentials, sessions, staff } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { primaryAreaName } from "@/lib/repositories/staff-repository";

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  area: string | null;
  active: boolean;
  mustChangePassword: boolean;
};

export type SessionRecord = {
  id: string;
  user: SessionUser;
  expiresAt: Date;
};

export type LoginFailure = "invalid_credentials" | "inactive_member" | "auth_disabled" | "password_not_set";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Verify email + password. On success returns the staff id. */
export async function authenticate(
  email: string,
  password: string
): Promise<{ ok: true; staffId: string; mustChangePassword: boolean } | { ok: false; reason: LoginFailure }> {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .select({
      staffId: staff.id,
      active: staff.active,
      hash: authCredentials.passwordHash,
      salt: authCredentials.salt,
      enabled: authCredentials.enabled,
      mustChangePassword: authCredentials.mustChangePassword,
    })
    .from(staff)
    .leftJoin(authCredentials, eq(authCredentials.staffId, staff.id))
    .where(and(sql`lower(${staff.email}) = ${normalized}`, isNull(staff.deletedAt)))
    .limit(1);

  if (!row) return { ok: false, reason: "invalid_credentials" };
  if (!row.active) return { ok: false, reason: "inactive_member" };
  if (!row.hash || !row.salt) return { ok: false, reason: "password_not_set" };
  if (!row.enabled) return { ok: false, reason: "auth_disabled" };

  const valid = await verifyPassword(password, row.hash, row.salt);
  if (!valid) return { ok: false, reason: "invalid_credentials" };

  await db
    .update(authCredentials)
    .set({ lastLoginAt: new Date() })
    .where(eq(authCredentials.staffId, row.staffId));
  return { ok: true, staffId: row.staffId, mustChangePassword: row.mustChangePassword ?? false };
}

/** Create a session row. Returns the opaque token and its expiry. */
export async function createSessionRecord(
  staffId: string,
  userAgent?: string | null
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    staffId,
    userAgent: userAgent ?? null,
    expiresAt,
  });
  return { token, expiresAt };
}

/** Resolve a token to a live session, or null. */
export async function findSessionByToken(token: string): Promise<SessionRecord | null> {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      staffId: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      active: staff.active,
      mustChangePassword: authCredentials.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(staff, eq(staff.id, sessions.staffId))
    .leftJoin(authCredentials, eq(authCredentials.staffId, staff.id))
    .where(
      and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), isNull(staff.deletedAt))
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.sessionId,
    expiresAt: row.expiresAt,
    user: {
      id: row.staffId,
      name: row.name,
      email: row.email,
      role: row.role,
      area: await primaryAreaName(row.staffId),
      active: row.active,
      mustChangePassword: row.mustChangePassword ?? false,
    },
  };
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Sessions are hard-deleted; expired rows are swept opportunistically. */
export async function deleteExpiredSessions(): Promise<number> {
  const rows = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
  return rows.length;
}

export async function getCredential(staffId: string) {
  const [row] = await db.select().from(authCredentials).where(eq(authCredentials.staffId, staffId)).limit(1);
  return row ?? null;
}

/** Set a new password chosen by the staff member; clears must_change_password. */
export async function setOwnPassword(staffId: string, password: string): Promise<void> {
  const { hash, salt } = await hashPassword(password);
  const values = {
    passwordHash: hash,
    salt,
    enabled: true,
    mustChangePassword: false,
    passwordUpdatedAt: new Date(),
  };
  await db
    .insert(authCredentials)
    .values({ staffId, ...values })
    .onConflictDoUpdate({
      target: authCredentials.staffId,
      set: { passwordHash: hash, salt, mustChangePassword: false, passwordUpdatedAt: values.passwordUpdatedAt },
    });
}
