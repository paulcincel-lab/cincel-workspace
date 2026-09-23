import { eq } from "drizzle-orm";

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

export async function getGoogleOauthAccount(staffId: string): Promise<GoogleOauthAccount | null> {
  const [row] = await db.select().from(googleOauthAccounts).where(eq(googleOauthAccounts.staffId, staffId)).limit(1);
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
    .where(eq(googleOauthAccounts.staffId, staffId));
}

export async function deleteGoogleOauthAccount(staffId: string): Promise<void> {
  await db.delete(googleOauthAccounts).where(eq(googleOauthAccounts.staffId, staffId));
}
