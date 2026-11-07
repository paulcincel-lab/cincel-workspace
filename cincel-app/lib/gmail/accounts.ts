/**
 * Gmail sync state of one staff member (`gmail_accounts`, redesign BE §3.7,
 * §8.6): consent upsert, error marks and the 429/5xx backoff. Every function
 * takes the staff id from the caller's session or the cron job, never from
 * user input, and touches only that staff member's row.
 */
import { and, eq, isNotNull } from "drizzle-orm";

import { gmailAccounts, googleOauthAccounts } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

export type GmailAccountState = typeof gmailAccounts.$inferSelect;

/** `last_error` after a refresh refused by Google: the account counts as not connected (BE §8.6). */
export const GMAIL_ERROR_INVALID_GRANT = "invalid_grant";
/** `last_error` when the stored grant lacks `gmail.readonly` / `gmail.compose`. */
export const GMAIL_ERROR_SCOPE_MISSING = "scope_missing";
/** `last_error` when the staff member has no usable Google token at all. */
export const GMAIL_ERROR_NOT_CONNECTED = "not_connected";
/** `last_error` prefix of a backoff; the suffix counts consecutive failures (0-based). */
export const GMAIL_ERROR_RATE_LIMITED_PREFIX = "rate_limited:";

/** Errors that only a new consent clears; the sync job skips these accounts. */
export const GMAIL_ERRORS_NEEDING_CONSENT = [
  GMAIL_ERROR_INVALID_GRANT,
  GMAIL_ERROR_SCOPE_MISSING,
  GMAIL_ERROR_NOT_CONNECTED,
] as const;

/** Backoff ceiling (BE §8.6). */
export const GMAIL_BACKOFF_CAP_MINUTES = 60;

/** `min(2^n min, 60 min)` for the n-th consecutive failure (n from 0). */
export function gmailBackoffMinutes(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt < 0) return 1;
  return Math.min(2 ** Math.floor(attempt), GMAIL_BACKOFF_CAP_MINUTES);
}

/** The failure count stored in `last_error` by the previous backoff, or -1 when the last run was not one. */
export function previousBackoffAttempt(lastError: string | null | undefined): number {
  if (!lastError?.startsWith(GMAIL_ERROR_RATE_LIMITED_PREFIX)) return -1;
  const n = Number.parseInt(lastError.slice(GMAIL_ERROR_RATE_LIMITED_PREFIX.length), 10);
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

export async function findGmailAccountState(db: OwnerDb, staffId: string): Promise<GmailAccountState | null> {
  const [row] = await db.select().from(gmailAccounts).where(eq(gmailAccounts.staffId, staffId)).limit(1);
  return row ?? null;
}

/**
 * The consent callback for `gmail` (BE §11.1): creates the row or, after a
 * disconnect, clears `disconnected_at`, resets `history_id` (the next sync is
 * a full first sync) and drops any error or backoff.
 */
export async function connectGmailAccount(db: OwnerDb, staffId: string): Promise<void> {
  const fresh = { historyId: null, lastError: null, nextSyncAfter: null, disconnectedAt: null };
  await db
    .insert(gmailAccounts)
    .values({ staffId, ...fresh })
    .onConflictDoUpdate({ target: gmailAccounts.staffId, set: fresh });
}

/** The granted scope string of the staff member's own Google token, or null without one. */
export async function grantedGoogleScope(db: OwnerDb, staffId: string): Promise<string | null> {
  const [row] = await db
    .select({ scope: googleOauthAccounts.scope, accessToken: googleOauthAccounts.accessToken })
    .from(googleOauthAccounts)
    .where(and(eq(googleOauthAccounts.staffId, staffId), isNotNull(googleOauthAccounts.googleSub)))
    .limit(1);
  return row && row.accessToken ? row.scope : null;
}

/** Stores an error mark (`invalid_grant`, `scope_missing`, `not_connected`). */
export async function recordGmailError(db: OwnerDb, staffId: string, error: string): Promise<void> {
  await db.update(gmailAccounts).set({ lastError: error }).where(eq(gmailAccounts.staffId, staffId));
}

/**
 * 429 / 5xx (BE §8.6): `next_sync_after = now + min(2^n min, 60 min)` where n
 * counts consecutive failures since the last successful sync (which clears
 * `last_error`). Returns the new `next_sync_after`.
 */
export async function applyGmailBackoff(db: OwnerDb, staffId: string, now: Date): Promise<Date> {
  const current = await findGmailAccountState(db, staffId);
  const attempt = previousBackoffAttempt(current?.lastError) + 1;
  const nextSyncAfter = new Date(now.getTime() + gmailBackoffMinutes(attempt) * 60_000);
  await db
    .update(gmailAccounts)
    .set({ lastError: `${GMAIL_ERROR_RATE_LIMITED_PREFIX}${attempt}`, nextSyncAfter })
    .where(eq(gmailAccounts.staffId, staffId));
  return nextSyncAfter;
}
