"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import * as authRepository from "@/lib/repositories/auth-repository";
import { verifyPassword } from "@/lib/auth/password";
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

export async function loginAction(
  email: string,
  password: string
): Promise<LoginActionResult> {
  const result = await authRepository.authenticate(email, password);
  if (!result.ok) return { ok: false, reason: result.reason };

  const userAgent = (await headers()).get("user-agent");
  await createSession(result.staffId, userAgent);

  revalidatePath("/", "layout");
  return { ok: true, mustChangePassword: result.mustChangePassword };
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
 * First-access flow: the staff member is logged in with a temporary password
 * and `must_change_password = true`. No current-password check (they just
 * used it to log in).
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

  await authRepository.setOwnPassword(session.user.id, next);
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

  const cred = await authRepository.getCredential(session.user.id);

  // First-access members may not have set a password yet; when a hash exists
  // it must match.
  if (cred?.passwordHash && cred.salt) {
    const ok = await verifyPassword(currentPassword, cred.passwordHash, cred.salt);
    if (!ok) return { ok: false, reason: "invalid_current_password" };
  }

  await authRepository.setOwnPassword(session.user.id, next);
  revalidatePath("/", "layout");
  return { ok: true };
}
