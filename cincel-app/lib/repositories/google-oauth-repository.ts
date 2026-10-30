import { and, eq, isNull } from "drizzle-orm";

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
 * (review NB 5).
 */
const legacyRow = (staffId: string) => and(eq(googleOauthAccounts.staffId, staffId), isNull(googleOauthAccounts.googleSub));

export async function getGoogleOauthAccount(staffId: string): Promise<GoogleOauthAccount | null> {
  const [row] = await db.select().from(googleOauthAccounts).where(legacyRow(staffId)).limit(1);
  return row ? toAccount(row) : null;
}

/**
 * Connects (or replaces) the Google account for a staff member. `refreshToken`
 * is only sent by Google on the first consent for a given account, so a
 * reconnect that omits it keeps whatever was already stored.
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

export async function deleteGoogleOauthAccount(staffId: string): Promise<void> {
  await db.delete(googleOauthAccounts).where(eq(googleOauthAccounts.staffId, staffId));
}
