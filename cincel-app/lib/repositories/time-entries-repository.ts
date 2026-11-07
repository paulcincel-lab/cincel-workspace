/** Control de horario entries (redesign BE §3.8, §8.7). Own rows via `ownerScoped`. */
import { timeEntries } from "@/lib/db/schema";
import { ownerScoped, type OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";

export type TimeEntryRow = typeof timeEntries.$inferSelect;

export const timeEntriesRepository = ownerScoped(timeEntries);

/** Entries of `staffIds` with `work_date` in `[from, to]` (team report, week hours). */
export async function listTimeEntries(
  db: OwnerDb,
  filter: { staffIds: string[]; from: string; to: string },
): Promise<TimeEntryRow[]> {
  return notImplemented("listTimeEntries", db, filter);
}
