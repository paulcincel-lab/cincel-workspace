/**
 * Gmail sync (redesign BE §8.6): first run lists the last 100 inbox threads,
 * later runs use `history.list` from `history_id` (404 → full list); upserts
 * the cache, suggests projects, trims to 500 rows. No notifications.
 */
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";

export async function syncGmail(db: OwnerDb, staffId: string): Promise<{ synced: number }> {
  return notImplemented("syncGmail", db, staffId);
}
