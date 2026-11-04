import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { isGoogleAuthEnabled } from "@/lib/auth/auth-flags";
import { db } from "@/lib/db/client";
import { googleOauthAccounts } from "@/lib/db/schema";

export type GoogleOauthAccount = {
  staffId: string;
  email: string;
  accessToken: string;
  refreshToken: string | null;
  scope: string;
  expiresAt: Date;
};

function toAccount(row: typeof googleOauthAccounts.$inferSelect): GoogleOauthAccount {
  return {
    staffId: row.staffId,
    email: row.email,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    scope: row.scope,
    expiresAt: row.expiresAt,
  };
}

/**
 * The old connect flow (picker, Calendar sync) only uses legacy rows, with
 * `google_sub` null and plaintext tokens. Rows written by staff Google
 * sign-in carry `google_sub` and encrypted tokens and are skipped here
 * (review NB 5), so turning AUTH_GOOGLE_ENABLED back off never hands an
 * encrypted token to the delegation path. The staff_token side reads only
 * rows with `google_sub` set (lib/google/staff-token.ts).
 */
const legacyRow = (staffId: string) => and(eq(googleOauthAccounts.staffId, staffId), isNull(googleOauthAccounts.googleSub));

export async function getGoogleOauthAccount(staffId: string): Promise<GoogleOauthAccount | null> {
  const [row] = await db.select().from(googleOauthAccounts).where(legacyRow(staffId)).limit(1);
  return row ? toAccount(row) : null;
}

/**
 * Email and granted scope of the staff-token row (`google_sub` set), for
 * status displays. Tokens stay out of it: they are ciphertext, read only
 * through lib/google/staff-token.ts.
 */
export async function getStaffTokenAccount(staffId: string): Promise<{ email: string; scope: string } | null> {
  const [row] = await db
    .select({ email: googleOauthAccounts.email, scope: googleOauthAccounts.scope })
    .from(googleOauthAccounts)
    .where(and(eq(googleOauthAccounts.staffId, staffId), isNotNull(googleOauthAccounts.googleSub)))
    .limit(1);
  return row ?? null;
}

/**
 * Connects (or replaces) the Google account for a staff member. `refreshToken`
 * is only sent by Google on the first consent for a given account, so a
 * reconnect that omits it keeps whatever was already stored.
 *
 * While AUTH_GOOGLE_ENABLED is on, a staff-token row (`google_sub` set) is
 * left untouched, so the old connect flow can't break the staff member's own
 * Drive grant. With the flag off it may replace that row, which then becomes
 * a legacy row the delegation path can read.
 */
export async function upsertGoogleOauthAccount(
  staffId: string,
  input: { email: string; accessToken: string; refreshToken: string | null; scope: string; expiresAt: Date }
): Promise<void> {
  await db
    .insert(googleOauthAccounts)
    .values({
      staffId,
      email: input.email,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      scope: input.scope,
      expiresAt: input.expiresAt,
    })
    .onConflictDoUpdate({
      target: googleOauthAccounts.staffId,
      set: {
        email: input.email,
        accessToken: input.accessToken,
        ...(input.refreshToken ? { refreshToken: input.refreshToken } : {}),
        scope: input.scope,
        expiresAt: input.expiresAt,
        googleSub: null,
      },
      ...(isGoogleAuthEnabled() ? { setWhere: isNull(googleOauthAccounts.googleSub) } : {}),
    });
}

/** Persists a refreshed access token without touching the stored refresh token. */
export async function updateGoogleOauthTokens(
  staffId: string,
  input: { accessToken: string; expiresAt: Date }
): Promise<void> {
  await db
    .update(googleOauthAccounts)
    .set({ accessToken: input.accessToken, expiresAt: input.expiresAt })
    .where(legacyRow(staffId));
}

/** Disconnect of the old connect flow: removes only the legacy row, never a staff-token row. */
export async function deleteGoogleOauthAccount(staffId: string): Promise<void> {
  await db.delete(googleOauthAccounts).where(legacyRow(staffId));
}
