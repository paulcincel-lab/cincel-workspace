import "server-only";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { authCredentials, authEvents, googleOauthAccounts, staff } from "@/lib/db/schema";
import { recordDirectoryError } from "@/lib/auth/directory-error-log";
import type { GoogleSignInMeta } from "@/lib/auth/google-sign-in";
import { applyAccess, evaluateAccess, type EvaluateAccessOptions } from "@/lib/auth/workspace-access";
import { DirectoryError } from "@/lib/google/directory";
import {
  hasGrantedScope,
  type StaffIdentity,
  type StaffOauthScope,
  type StaffTokens,
} from "@/lib/google/staff-oauth";
import { encryptToken, tokenEncryptionKey } from "@/lib/google/token-crypto";
import type { WorkspaceDenialReason } from "@/lib/types/workspace-access";

/**
 * Incremental Google consent for a signed-in staff member (backend spec
 * §A.6.2, review NB 6): the callback branch of `/api/auth/google/start?scope=`.
 * It never creates or deletes a session; the staff member stays signed in
 * whatever the outcome.
 *
 * - Staff with `google_sub`: the token's `sub` must equal it (`sub_mismatch`),
 *   then the tokens and granted scope replace the stored ones.
 * - Staff without `google_sub` (password session during cutover): the token
 *   email must be theirs, then the full §A.4 gate runs. Allowed → link
 *   `google_sub` to the signed-in row, apply role and áreas, store tokens.
 *   Denied → nothing is stored.
 */

export type GoogleConsentResult =
  | { status: "granted"; staffId: string; linked: boolean }
  /** Google returned tokens without the requested scope (the box was unchecked). */
  | { status: "scope_missing"; staffId: string }
  | { status: "denied"; reason: WorkspaceDenialReason }
  /** The Directory couldn't be reached; nothing stored. */
  | { status: "retry" };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && (current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function logEvent(
  executor: Tx | typeof db,
  kind: "staff_google_consent" | "staff_google_consent_denied",
  values: { staffId: string; email: string; reason: string | null; meta: GoogleSignInMeta },
): Promise<void> {
  await executor.insert(authEvents).values({
    kind,
    staffId: values.staffId,
    email: values.email,
    reason: values.reason,
    ip: values.meta.ip,
    userAgent: values.meta.userAgent,
  });
}

type EncryptedTokens = { accessToken: string; refreshToken: string | null; scope: string; expiresAt: Date };

/** On conflict without a new refresh token: keep an encrypted one, drop a legacy plaintext one. */
const keptRefreshToken = sql`case when ${googleOauthAccounts.googleSub} is null then null
  else ${googleOauthAccounts.refreshToken} end`;

/**
 * Writes the encrypted tokens with `google_sub`. Unlike sign-in, a legacy row
 * of the old connect flow is replaced: granting Drive or Calendar is the
 * moment the staff member moves to their own Google token. When Google sends
 * no refresh token, an existing encrypted one is kept and a legacy plaintext
 * one is dropped.
 */
async function storeConsentTokens(
  tx: Tx,
  staffId: string,
  identity: StaffIdentity,
  tokens: EncryptedTokens,
): Promise<void> {
  await tx
    .insert(googleOauthAccounts)
    .values({
      staffId,
      email: identity.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      scope: tokens.scope,
      googleSub: identity.sub,
      expiresAt: tokens.expiresAt,
    })
    .onConflictDoUpdate({
      target: googleOauthAccounts.staffId,
      set: {
        email: identity.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? keptRefreshToken,
        scope: tokens.scope,
        googleSub: identity.sub,
        expiresAt: tokens.expiresAt,
      },
    });
}

/** Raised inside the link transaction to roll it back with a denial reason. */
class ConsentDenied extends Error {
  constructor(readonly reason: WorkspaceDenialReason) {
    super(reason);
    this.name = "ConsentDenied";
  }
}

/**
 * Handles the consent callback for the signed-in `staffId`. Throws
 * `TokenCryptoError` when `TOKEN_ENCRYPTION_KEY` is missing (checked before
 * any Google or DB call).
 */
export async function grantGoogleScope(
  staffId: string,
  scope: StaffOauthScope,
  identity: StaffIdentity,
  tokens: StaffTokens,
  meta: GoogleSignInMeta,
  options: EvaluateAccessOptions = {},
): Promise<GoogleConsentResult> {
  const key = tokenEncryptionKey();
  const encrypted: EncryptedTokens = {
    accessToken: encryptToken(tokens.accessToken, key),
    refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken, key) : null,
    scope: tokens.scope,
    expiresAt: tokens.expiresAt,
  };

  const [current] = await db
    .select({ id: staff.id, email: staff.email, googleSub: staff.googleSub, active: staff.active })
    .from(staff)
    .where(and(eq(staff.id, staffId), isNull(staff.deletedAt)))
    .limit(1);

  const deny = async (reason: WorkspaceDenialReason): Promise<GoogleConsentResult> => {
    if (current) await logEvent(db, "staff_google_consent_denied", { staffId, email: identity.email, reason, meta });
    return { status: "denied", reason };
  };

  if (!current) return { status: "denied", reason: "inactive" };
  if (!current.active) return deny("inactive");

  const outcome = (linked: boolean): GoogleConsentResult =>
    hasGrantedScope(tokens.scope, scope)
      ? { status: "granted", staffId, linked }
      : { status: "scope_missing", staffId };

  // Already linked: only the same Google account may extend the grant.
  if (current.googleSub) {
    if (current.googleSub !== identity.sub) return deny("sub_mismatch");
    await db.transaction(async (tx) => {
      await storeConsentTokens(tx, staffId, identity, encrypted);
      await logEvent(tx, "staff_google_consent", { staffId, email: identity.email, reason: scope, meta });
    });
    return outcome(false);
  }

  // Password session during cutover: the Google account must be this staff member's.
  if (!current.email || current.email.trim().toLowerCase() !== identity.email) return deny("sub_mismatch");
  const [taken] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.googleSub, identity.sub), ne(staff.id, staffId), isNull(staff.deletedAt)))
    .limit(1);
  if (taken) return deny("sub_mismatch");

  let access;
  try {
    access = await evaluateAccess(identity.sub, identity.email, options);
  } catch (error) {
    if (error instanceof DirectoryError) {
      console.error(`[google-consent] Directory error (${error.kind}${error.status ? ` ${error.status}` : ""})`);
      await recordDirectoryError("sign_in", error, { email: identity.email });
      return { status: "retry" };
    }
    throw error;
  }
  // Gate denial (review NB 6): keep the session, store nothing.
  if (!access.allowed) return deny(access.reason);
  const granted = access;

  try {
    await db.transaction(async (tx) => {
      const linked = await tx
        .update(staff)
        .set({ googleSub: identity.sub })
        .where(and(eq(staff.id, staffId), isNull(staff.googleSub)))
        .returning({ id: staff.id });
      if (linked.length === 0) throw new ConsentDenied("sub_mismatch");
      await applyAccess(staffId, granted, tx);
      // Google staff have no password state (§A.4).
      await tx.update(authCredentials).set({ mustChangePassword: false }).where(eq(authCredentials.staffId, staffId));
      await storeConsentTokens(tx, staffId, identity, encrypted);
      await logEvent(tx, "staff_google_consent", { staffId, email: identity.email, reason: scope, meta });
    });
  } catch (error) {
    if (error instanceof ConsentDenied) return deny(error.reason);
    if (isUniqueViolation(error)) return deny("sub_mismatch");
    throw error;
  }
  return outcome(true);
}
