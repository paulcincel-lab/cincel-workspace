import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { googleOauthAccounts } from "@/lib/db/schema";
import {
  hasGrantedScope,
  refreshStaffAccessToken,
  StaffOauthInvalidGrantError,
  type StaffOauthScope,
} from "@/lib/google/staff-oauth";
import { decryptToken, encryptToken, tokenEncryptionKey } from "@/lib/google/token-crypto";

/**
 * The staff member's own Google access token (backend spec §A.6.2), read
 * only from rows written by Google sign-in or consent (`google_sub` set,
 * encrypted). Refreshes when it is about to expire. `invalid_grant` on
 * refresh clears the tokens and scope, so the UI shows **Conectar Google
 * Drive** again.
 */

export type StaffAccessTokenResult = { status: "ok"; accessToken: string } | { status: "needs_consent" };

/** Refresh this long before expiry. */
const EXPIRY_MARGIN_MS = 60 * 1000;

const staffTokenRow = (staffId: string) =>
  and(eq(googleOauthAccounts.staffId, staffId), isNotNull(googleOauthAccounts.googleSub));

/** Drops the tokens and scope of a dead grant; the row stays a staff-token row. */
export async function clearStaffGoogleTokens(staffId: string): Promise<void> {
  await db
    .update(googleOauthAccounts)
    .set({ accessToken: "", refreshToken: null, scope: "", expiresAt: new Date(0) })
    .where(staffTokenRow(staffId));
}

export type StaffTokenDeps = {
  refresh?: typeof refreshStaffAccessToken;
  now?: () => number;
};

export async function getStaffAccessToken(
  staffId: string,
  scope: StaffOauthScope,
  deps: StaffTokenDeps = {},
): Promise<StaffAccessTokenResult> {
  const refresh = deps.refresh ?? refreshStaffAccessToken;
  const now = deps.now?.() ?? Date.now();

  const [row] = await db.select().from(googleOauthAccounts).where(staffTokenRow(staffId)).limit(1);
  if (!row || !row.accessToken || !hasGrantedScope(row.scope, scope)) return { status: "needs_consent" };

  const key = tokenEncryptionKey();
  if (row.expiresAt.getTime() - EXPIRY_MARGIN_MS > now) {
    return { status: "ok", accessToken: decryptToken(row.accessToken, key) };
  }
  if (!row.refreshToken) return { status: "needs_consent" };

  let refreshed;
  try {
    refreshed = await refresh(decryptToken(row.refreshToken, key));
  } catch (error) {
    if (error instanceof StaffOauthInvalidGrantError) {
      await clearStaffGoogleTokens(staffId);
      return { status: "needs_consent" };
    }
    throw error;
  }

  await db
    .update(googleOauthAccounts)
    .set({
      accessToken: encryptToken(refreshed.accessToken, key),
      expiresAt: refreshed.expiresAt,
      ...(refreshed.scope ? { scope: refreshed.scope } : {}),
    })
    .where(staffTokenRow(staffId));
  return { status: "ok", accessToken: refreshed.accessToken };
}
