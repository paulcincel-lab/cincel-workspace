/** Vacation requests (redesign BE §3.9, §7.8, §8.8). */
import { vacationRequests } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";
import type { VacationStatus } from "@/lib/types/redesign";

export type VacationRequestRow = typeof vacationRequests.$inferSelect;

/** Requests overlapping `[from, to]`, optionally for some staff and statuses. */
export async function listVacationRequests(
  db: OwnerDb,
  filter: { from?: string; to?: string; staffIds?: string[]; statuses?: VacationStatus[] },
): Promise<VacationRequestRow[]> {
  return notImplemented("listVacationRequests", db, filter);
}
