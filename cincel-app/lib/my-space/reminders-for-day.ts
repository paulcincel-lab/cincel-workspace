/**
 * Phase 1 read helper (redesign BE §8.12): the caller's open reminders of one
 * local day as agenda items (Inicio "Mi día"). Empty until reminders exist.
 *
 * Open = not fired and not cancelled (BE §8.5). The local day is
 * `America/Mexico_City` (BE §8.7), compared in SQL so the time zone rules come
 * from Postgres. Items are built with the shared `toAgendaItems` builder.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { reminders } from "@/lib/db/schema";
import { toAgendaItems } from "@/lib/metrics/widgets";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/settings";
import type { Reminder, ReminderChannel } from "@/lib/types/redesign";
import type { AgendaItem } from "@/lib/types/widgets";

export async function remindersForDay(db: OwnerDb, staffId: string, date: string): Promise<AgendaItem[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const rows = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.staffId, staffId),
        isNull(reminders.firedAt),
        isNull(reminders.cancelledAt),
        sql`(${reminders.dueAt} at time zone ${TIME_TRACKING_TIME_ZONE})::date = ${date}::date`,
      ),
    )
    .orderBy(asc(reminders.dueAt), asc(reminders.id));
  if (rows.length === 0) return [];
  const items: Reminder[] = rows.map((row) => ({
    id: row.id,
    text: row.text,
    dueAt: row.dueAt.toISOString(),
    repeat: row.repeat,
    channels: row.channels as ReminderChannel[],
    taskId: row.taskId,
    projectId: row.projectId,
    firedAt: row.firedAt ? row.firedAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
  }));
  return toAgendaItems({ kind: "reminders", items });
}
