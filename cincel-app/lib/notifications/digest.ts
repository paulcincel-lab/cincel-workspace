/**
 * Daily digest (redesign BE §9.3): one `resumen-diario` email per staff with
 * at least one unsent `digest` row of the last 24 h; sets `digested_at`. Run by
 * the `daily-digest` job after the daily producers.
 */
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";

export async function sendDailyDigests(db: OwnerDb, now: Date): Promise<{ count: number }> {
  return notImplemented("sendDailyDigests", db, now);
}

/** Sends due `pending` emails (limit 200) and records `sent` / `failed` (job `notifications-deliver`). */
export async function deliverPendingEmails(db: OwnerDb, now: Date): Promise<{ count: number }> {
  return notImplemented("deliverPendingEmails", db, now);
}
