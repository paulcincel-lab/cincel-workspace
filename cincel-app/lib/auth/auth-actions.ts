"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { authCredentials, teamMembers } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSession } from "@/lib/auth/session";

export type LoginActionResult =
  | { ok: true; mustChangePassword: boolean }
  | {
      ok: false;
      reason:
        | "invalid_credentials"
        | "inactive_member"
        | "auth_disabled"
        | "password_not_set";
    };

const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function loginAction(
  email: string,
  password: string
): Promise<LoginActionResult> {
  const [row] = await db
    .select({
      memberId: teamMembers.id,
      active: teamMembers.active,
      credHash: authCredentials.passwordHash,
      credSalt: authCredentials.salt,
      authEnabled: authCredentials.authEnabled,
      mustChangePassword: authCredentials.mustChangePassword,
    })
    .from(teamMembers)
    .leftJoin(authCredentials, eq(authCredentials.teamMemberId, teamMembers.id))
    .where(
      and(
        eq(teamMembers.institutionalEmail, normalizeEmail(email)),
        isNull(teamMembers.deletedAt)
      )
    )
    .limit(1);

  if (!row) return { ok: false, reason: "invalid_credentials" };
  if (!row.active) return { ok: false, reason: "inactive_member" };
  if (!row.credHash || !row.credSalt) {
    return { ok: false, reason: "password_not_set" };
  }
  if (!row.authEnabled) return { ok: false, reason: "auth_disabled" };

  const valid = await verifyPassword(password, row.credHash, row.credSalt);
  if (!valid) return { ok: false, reason: "invalid_credentials" };

  const userAgent = (await headers()).get("user-agent");
  await createSession(row.memberId, userAgent);
  await db
    .update(authCredentials)
    .set({ lastLoginAt: new Date() })
    .where(eq(authCredentials.teamMemberId, row.memberId));

  revalidatePath("/", "layout");
  return { ok: true, mustChangePassword: row.mustChangePassword ?? false };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  revalidatePath("/", "layout");
}

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "no_session"
        | "invalid_current_password"
        | "password_too_short"
        | "password_confirmation_mismatch";
    };

/**
 * First-access flow: the member is logged in with a temporary password and
 * `must_change_password = true`. No current-password check (they just used it
 * to log in).
 */
export async function completeFirstAccessAction(
  newPassword: string,
  confirmation: string
): Promise<ChangePasswordResult> {
  const session = await getSession();
  if (!session) return { ok: false, reason: "no_session" };

  const next = newPassword.trim();
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: "password_too_short" };
  }
  if (next !== confirmation.trim()) {
    return { ok: false, reason: "password_confirmation_mismatch" };
  }

  const { hash, salt } = await hashPassword(next);
  await db
    .insert(authCredentials)
    .values({
      teamMemberId: session.user.id,
      passwordHash: hash,
      salt,
      authEnabled: true,
      mustChangePassword: false,
      passwordUpdatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: authCredentials.teamMemberId,
      set: {
        passwordHash: hash,
        salt,
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
      },
    });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
  confirmation: string
): Promise<ChangePasswordResult> {
  const session = await getSession();
  if (!session) return { ok: false, reason: "no_session" };

  const next = newPassword.trim();
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: "password_too_short" };
  }
  if (next !== confirmation.trim()) {
    return { ok: false, reason: "password_confirmation_mismatch" };
  }

  const [cred] = await db
    .select({
      hash: authCredentials.passwordHash,
      salt: authCredentials.salt,
    })
    .from(authCredentials)
    .where(eq(authCredentials.teamMemberId, session.user.id))
    .limit(1);

  // First-access members may not have set a password yet; when a hash exists it
  // must match.
  if (cred?.hash && cred.salt) {
    const ok = await verifyPassword(currentPassword, cred.hash, cred.salt);
    if (!ok) return { ok: false, reason: "invalid_current_password" };
  }

  const { hash, salt } = await hashPassword(next);
  await db
    .insert(authCredentials)
    .values({
      teamMemberId: session.user.id,
      passwordHash: hash,
      salt,
      authEnabled: true,
      mustChangePassword: false,
      passwordUpdatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: authCredentials.teamMemberId,
      set: {
        passwordHash: hash,
        salt,
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
      },
    });

  revalidatePath("/", "layout");
  return { ok: true };
}
