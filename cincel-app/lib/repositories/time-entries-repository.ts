/** Control de horario entries (redesign BE §3.8, §8.7). Own rows via `ownerScoped`. */
import { and, asc, gte, inArray, lte } from "drizzle-orm";

import { timeEntries } from "@/lib/db/schema";
import { ownerScoped, type OwnerDb } from "@/lib/repositories/owner-scoped";

export type TimeEntryRow = typeof timeEntries.$inferSelect;

export const timeEntriesRepository = ownerScoped(timeEntries);

/** Entries of `staffIds` with `work_date` in `[from, to]` (team report, week hours). */
export async function listTimeEntries(
  db: OwnerDb,
  filter: { staffIds: string[]; from: string; to: string },
): Promise<TimeEntryRow[]> {
  const ids = [...new Set(filter.staffIds)];
  if (ids.length === 0) return [];
  return db
    .select()
    .from(timeEntries)
    .where(
      and(
        inArray(timeEntries.staffId, ids),
        gte(timeEntries.workDate, filter.from),
        lte(timeEntries.workDate, filter.to),
      ),
    )
    .orderBy(asc(timeEntries.staffId), asc(timeEntries.workDate), asc(timeEntries.startedAt));
}
