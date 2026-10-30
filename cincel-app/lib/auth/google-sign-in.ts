import "server-only";

import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { authCredentials, authEvents, googleOauthAccounts, staff } from "@/lib/db/schema";
import { applyAccess, evaluateAccess, type EvaluateAccessOptions } from "@/lib/auth/workspace-access";
import { DirectoryError } from "@/lib/google/directory";
import type { StaffIdentity, StaffTokens } from "@/lib/google/staff-oauth";
import { encryptToken, tokenEncryptionKey } from "@/lib/google/token-crypto";
import type { WorkspaceDenialReason } from "@/lib/types/workspace-access";

/**
 * Staff Google sign-in after the ID token is verified (backend spec §A.4):
 * the Workspace gate, the staff row resolution (by `sub`, then by email) and
 * the writes for an allowed sign-in. It never creates a session: the callback
 * route calls `createSession()` only for an `allowed` result, so a refused
 * user never gets a `core.sessions` row.
 */

export type GoogleSignInMeta = { ip: string | null; userAgent: string | null };

export type GoogleSignInResult =
  | { status: "allowed"; staffId: string }
  | { status: "denied"; reason: WorkspaceDenialReason; staffId: string | null }
  /** The Directory couldn't be reached: no session, `/login?error=retry`. */
  | { status: "retry" };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UNIQUE_VIOLATION = "23505";

/** Whether an error (or its `cause`, as drizzle wraps driver errors) is a unique violation. */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && (current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Raised inside the transaction to roll it back with a denial reason. */
class SignInDenied extends Error {
  constructor(
    readonly reason: WorkspaceDenialReason,
    readonly staffId: string | null,
  ) {
    super(reason);
    this.name = "SignInDenied";
  }
}

async function logEvent(
  executor: Tx | typeof db,
  kind: "staff_login_allowed" | "staff_login_denied",
  values: { staffId: string | null; email: string; reason: string | null; meta: GoogleSignInMeta },
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

/** Records a sign-in refused before the gate ran (ID token outside the domain or unverified). */
export async function recordGoogleSignInDenied(
  reason: WorkspaceDenialReason,
  meta: GoogleSignInMeta,
  email: string | null = null,
): Promise<void> {
  await db.insert(authEvents).values({
    kind: "staff_login_denied",
    staffId: null,
    email,
    reason,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

/** The staff row this Google account points at, if any (audit only). */
async function findStaffIdForAudit(identity: StaffIdentity): Promise<string | null> {
  const [row] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(
      and(
        isNull(staff.deletedAt),
        or(eq(staff.googleSub, identity.sub), sql`lower(${staff.email}) = ${identity.email}`),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

function displayName(identity: StaffIdentity): string {
  return identity.name ?? identity.email.split("@")[0];
}

/**
 * Resolution order (§A.4), ignoring soft-deleted rows:
 * 1. `google_sub = sub` → that row.
 * 2. `lower(email)` matches and `google_sub` is null → link it.
 * 3. `lower(email)` matches but `google_sub` differs → `sub_mismatch`.
 * 4. No email match and `lower(name)` is taken → `needs_link`.
 * 5. Otherwise create the staff row.
 * A matched row with `active = false` → `inactive`.
 */
async function resolveStaff(tx: Tx, identity: StaffIdentity): Promise<string> {
  const [bySub] = await tx
    .select({ id: staff.id, active: staff.active })
    .from(staff)
    .where(and(eq(staff.googleSub, identity.sub), isNull(staff.deletedAt)))
    .limit(1);
  if (bySub) {
    if (!bySub.active) throw new SignInDenied("inactive", bySub.id);
    return bySub.id;
  }

  const [byEmail] = await tx
    .select({ id: staff.id, active: staff.active, googleSub: staff.googleSub })
    .from(staff)
    .where(and(sql`lower(${staff.email}) = ${identity.email}`, isNull(staff.deletedAt)))
    .limit(1);
  if (byEmail) {
    if (byEmail.googleSub !== null) throw new SignInDenied("sub_mismatch", byEmail.id);
    if (!byEmail.active) throw new SignInDenied("inactive", byEmail.id);
    await tx.update(staff).set({ googleSub: identity.sub }).where(eq(staff.id, byEmail.id));
    return byEmail.id;
  }

  const name = displayName(identity);
  const [byName] = await tx
    .select({ id: staff.id })
    .from(staff)
    .where(and(sql`lower(${staff.name}) = lower(${name})`, isNull(staff.deletedAt)))
    .limit(1);
  if (byName) throw new SignInDenied("needs_link", null);

  const [created] = await tx
    .insert(staff)
    .values({ name, email: identity.email, kind: "empleado", active: true, googleSub: identity.sub })
    .returning({ id: staff.id });
  return created.id;
}

/**
 * Stores the sign-in tokens encrypted, with `google_sub`, so later incremental
 * grants extend the same row. A legacy row of the old connect flow
 * (`google_sub` null, plaintext) is left untouched: the old Drive picker and
 * Calendar sync keep using it until the staff member grants Drive or Calendar.
 */
async function storeTokens(
  tx: Tx,
  staffId: string,
  identity: StaffIdentity,
  tokens: { accessToken: string; refreshToken: string | null; scope: string; expiresAt: Date },
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
        ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
        scope: tokens.scope,
        googleSub: identity.sub,
        expiresAt: tokens.expiresAt,
      },
      setWhere: isNotNull(googleOauthAccounts.googleSub),
    });
}

/**
 * Runs the gate and, when it passes, links or creates the staff row, applies
 * role and áreas, clears `must_change_password`, stores the encrypted tokens
 * and records `staff_login_allowed`, all in one transaction. Denials record
 * `staff_login_denied` with the reason. A unique violation during the upsert
 * maps to `needs_link`, never a 500.
 *
 * Throws `TokenCryptoError` when `TOKEN_ENCRYPTION_KEY` is missing (checked
 * before any Google or DB call).
 */
export async function signInWithGoogle(
  identity: StaffIdentity,
  tokens: StaffTokens,
  meta: GoogleSignInMeta,
  options: EvaluateAccessOptions = {},
): Promise<GoogleSignInResult> {
  const key = tokenEncryptionKey();
  const encrypted = {
    accessToken: encryptToken(tokens.accessToken, key),
    refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken, key) : null,
    scope: tokens.scope,
    expiresAt: tokens.expiresAt,
  };

  let access;
  try {
    access = await evaluateAccess(identity.sub, identity.email, options);
  } catch (error) {
    if (error instanceof DirectoryError) {
      console.error(`[google-sign-in] Directory error (${error.kind}${error.status ? ` ${error.status}` : ""})`);
      return { status: "retry" };
    }
    throw error;
  }

  const deny = async (reason: WorkspaceDenialReason, staffId: string | null): Promise<GoogleSignInResult> => {
    await logEvent(db, "staff_login_denied", { staffId, email: identity.email, reason, meta });
    return { status: "denied", reason, staffId };
  };

  if (!access.allowed) return deny(access.reason, await findStaffIdForAudit(identity));
  const granted = access;

  try {
    const staffId = await db.transaction(async (tx) => {
      const id = await resolveStaff(tx, identity);
      await applyAccess(id, granted, tx);
      await tx.update(staff).set({ lastLoginAt: new Date() }).where(eq(staff.id, id));
      // Google staff have no password state (§A.4).
      await tx.update(authCredentials).set({ mustChangePassword: false }).where(eq(authCredentials.staffId, id));
      await storeTokens(tx, id, identity, encrypted);
      await logEvent(tx, "staff_login_allowed", { staffId: id, email: identity.email, reason: null, meta });
      return id;
    });
    return { status: "allowed", staffId };
  } catch (error) {
    if (error instanceof SignInDenied) return deny(error.reason, error.staffId);
    if (isUniqueViolation(error)) return deny("needs_link", null);
    throw error;
  }
}
