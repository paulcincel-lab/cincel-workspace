/**
 * Cron lease rows (redesign BE §3.11, review B14): one statement pair that
 * works on any pooled connection; a crashed holder's lease expires by itself.
 */
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";

/** Lease length of the whole tick. */
export const TICK_LEASE_SECONDS = 55;

/** True when `owner` now holds `job` until now + `seconds`. */
export async function acquireLease(db: OwnerDb, job: string, owner: string, seconds: number): Promise<boolean> {
  return notImplemented("acquireLease", db, job, owner, seconds);
}

/** Release `job` if `owner` still holds it. */
export async function releaseLease(db: OwnerDb, job: string, owner: string): Promise<void> {
  return notImplemented("releaseLease", db, job, owner);
}
