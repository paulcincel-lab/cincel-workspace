import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { calendarFeedTokens, staff } from "@/lib/db/schema";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hasCalendarFeed(staffId: string): Promise<boolean> {
  const [row] = await db
    .select({ staffId: calendarFeedTokens.staffId })
    .from(calendarFeedTokens)
    .where(eq(calendarFeedTokens.staffId, staffId))
    .limit(1);
  return Boolean(row);
}

/**
 * Creates (or replaces) the caller's feed token and returns the plain token —
 * the only time it's ever available; just its hash is stored.
 */
export async function createCalendarFeedToken(staffId: string): Promise<string> {
  const token = randomBytes(24).toString("hex");
  const tokenHash = hashToken(token);
  await db
    .insert(calendarFeedTokens)
    .values({ staffId, tokenHash })
    .onConflictDoUpdate({ target: calendarFeedTokens.staffId, set: { tokenHash } });
  return token;
}

export async function deleteCalendarFeedToken(staffId: string): Promise<void> {
  await db.delete(calendarFeedTokens).where(eq(calendarFeedTokens.staffId, staffId));
}

/** The staff member (if still active and not deleted) a feed token belongs to. */
export async function findStaffByCalendarFeedToken(
  token: string
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: staff.id, name: staff.name })
    .from(calendarFeedTokens)
    .innerJoin(staff, eq(staff.id, calendarFeedTokens.staffId))
    .where(and(eq(calendarFeedTokens.tokenHash, hashToken(token)), isNull(staff.deletedAt), eq(staff.active, true)))
    .limit(1);
  return row ?? null;
}
