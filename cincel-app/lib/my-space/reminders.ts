/**
 * Reminder firing (redesign BE §8.5; cron job `reminders-fire`, Phase 5):
 * due, open reminders (limit 500, `for update skip locked`) → `notify` with
 * kind `recordatorio`; non-repeating get `fired_at`, repeating move `due_at`
 * forward one period until it is in the future.
 */
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";
import type { ReminderRepeat } from "@/lib/types/redesign";

export async function fireDueReminders(db: OwnerDb, now: Date): Promise<{ count: number }> {
  return notImplemented("fireDueReminders", db, now);
}

/** Next occurrence after `now` (monthly: same day of month clamped to month end). */
export function nextOccurrence(dueAt: Date, repeat: Exclude<ReminderRepeat, "none">, now: Date): Date {
  return notImplemented("nextOccurrence", dueAt, repeat, now);
}
