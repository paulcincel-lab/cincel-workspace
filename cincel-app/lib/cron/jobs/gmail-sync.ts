/**
 * Cron job `gmail-sync` (redesign BE §13, owned by Phase 5).
 * Syncs up to `GMAIL_SYNC_MAX_PER_TICK` connected staff, oldest first, skipping backoff. Every tick.
 *
 * Connected = a `gmail_accounts` row without `disconnected_at` and without an
 * error only a new consent clears (`invalid_grant`, `scope_missing`,
 * `not_connected`). An account whose `next_sync_after` is in the future is
 * in backoff and waits. Each account runs on its own: a failure logs
 * `gmail.sync_failed` and the tick moves on.
 */
import { and, asc, isNull, lte, notInArray, or, sql } from "drizzle-orm";

import { registerJob, type CronJob } from "@/lib/cron/registry";
import { gmailAccounts } from "@/lib/db/schema";
import { applyGmailBackoff, GMAIL_ERRORS_NEEDING_CONSENT } from "@/lib/gmail/accounts";
import { isGmailError } from "@/lib/gmail/client";
import { logGmailSyncFailed, syncGmail } from "@/lib/gmail/sync";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

/** BE §14 default. */
export const GMAIL_SYNC_DEFAULT_PER_TICK = 10;

export function gmailSyncMaxPerTick(env: Record<string, string | undefined> = process.env): number {
  const raw = env.GMAIL_SYNC_MAX_PER_TICK?.trim();
  if (!raw) return GMAIL_SYNC_DEFAULT_PER_TICK;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : GMAIL_SYNC_DEFAULT_PER_TICK;
}

/** Staff ids to sync this tick: connected, not in backoff, oldest `last_synced_at` first (never synced first). */
export async function dueGmailAccounts(db: OwnerDb, now: Date, limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  const rows = await db
    .select({ staffId: gmailAccounts.staffId })
    .from(gmailAccounts)
    .where(
      and(
        isNull(gmailAccounts.disconnectedAt),
        or(isNull(gmailAccounts.nextSyncAfter), lte(gmailAccounts.nextSyncAfter, now)),
        or(isNull(gmailAccounts.lastError), notInArray(gmailAccounts.lastError, [...GMAIL_ERRORS_NEEDING_CONSENT])),
      ),
    )
    .orderBy(sql`${gmailAccounts.lastSyncedAt} asc nulls first`, asc(gmailAccounts.staffId))
    .limit(limit);
  return rows.map((r) => r.staffId);
}

/** Codes whose state the client already recorded (backoff or a consent mark). */
const HANDLED_CODES = new Set(["RATE_LIMITED", "NOT_CONNECTED", "SCOPE_MISSING"]);

export type GmailSyncJobDeps = { sync?: typeof syncGmail; maxPerTick?: number; clock?: () => number };

/** The job body, with injectable sync and clock for tests. */
export async function runGmailSync(
  ctx: Parameters<CronJob["run"]>[0],
  deps: GmailSyncJobDeps = {},
): Promise<{ count: number }> {
  const sync = deps.sync ?? syncGmail;
  const clock = deps.clock ?? Date.now;
  const started = clock();
  const staffIds = await dueGmailAccounts(ctx.db, ctx.now, deps.maxPerTick ?? gmailSyncMaxPerTick());
  let count = 0;
  for (const staffId of staffIds) {
    if (clock() - started >= ctx.budgetMs) break;
    try {
      await sync(ctx.db, staffId);
      count++;
    } catch (error) {
      logGmailSyncFailed(ctx.traceId, staffId, error);
      // Anything else (network, unexpected status) also waits before the next try,
      // so a failing account can't hold the head of the queue.
      if (!(isGmailError(error) && HANDLED_CODES.has(error.code))) {
        try {
          await applyGmailBackoff(ctx.db, staffId, ctx.now);
        } catch (backoffError) {
          logGmailSyncFailed(ctx.traceId, staffId, backoffError);
        }
      }
    }
  }
  return { count };
}

export const gmailSyncJob: CronJob = {
  name: "gmail-sync",
  due: () => ({ run: true }),
  run: (ctx) => runGmailSync(ctx),
};

registerJob(gmailSyncJob);
