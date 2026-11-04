import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { googleOauthAccounts } from "@/lib/db/schema";

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
