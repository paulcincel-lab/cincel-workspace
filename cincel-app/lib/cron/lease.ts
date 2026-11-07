/**
 * Cron lease rows (redesign BE §3.11, review B14): one statement pair that
 * works on any pooled connection; a crashed holder's lease expires by itself.
 *
 * Acquire: `insert … on conflict do nothing` makes sure the row exists, then a
 * single conditional `update … where locked_until < now() returning job`
 * takes it. Two concurrent updates serialize on the row lock and the loser
 * re-checks `locked_until` after the winner commits, so only one holds it.
 */
import { and, eq, lt, sql } from "drizzle-orm";

import { cronLeases } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

/** Lease length of the whole tick. */
export const TICK_LEASE_SECONDS = 55;

/** True when `owner` now holds `job` until now + `seconds`. */
export async function acquireLease(db: OwnerDb, job: string, owner: string, seconds: number): Promise<boolean> {
  await db.insert(cronLeases).values({ job }).onConflictDoNothing();
  const rows = await db
    .update(cronLeases)
    .set({ lockedUntil: sql`now() + make_interval(secs => ${seconds}::double precision)`, owner })
    .where(and(eq(cronLeases.job, job), lt(cronLeases.lockedUntil, sql`now()`)))
    .returning({ job: cronLeases.job });
  return rows.length > 0;
}

/** Release `job` if `owner` still holds it. */
export async function releaseLease(db: OwnerDb, job: string, owner: string): Promise<void> {
  await db
    .update(cronLeases)
    .set({ lockedUntil: sql`now()` })
    .where(and(eq(cronLeases.job, job), eq(cronLeases.owner, owner)));
}
