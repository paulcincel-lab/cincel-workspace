/**
 * Phase 1 read helper (redesign BE §8.12): approved vacation requests
 * overlapping `[from, to]`. None until requests exist.
 *
 * Each row keeps the request's full range (a multi-day absence that starts
 * before `from` or ends after `to` is returned whole). `kind` is the stored
 * kind; masking it to `ausencia` (BE §8.8) is the caller's job.
 */
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

import { vacationRequests } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import type { VacationKind } from "@/lib/types/redesign";

export async function approvedAbsences(
  db: OwnerDb,
  range: { from: string; to: string; staffIds?: string[] },
): Promise<{ staffId: string; from: string; to: string; kind: VacationKind }[]> {
  if (range.to < range.from) return [];
  const staffIds = range.staffIds ? [...new Set(range.staffIds)] : undefined;
  if (staffIds && staffIds.length === 0) return [];
  return db
    .select({
      staffId: vacationRequests.staffId,
      from: vacationRequests.fromDate,
      to: vacationRequests.toDate,
      kind: vacationRequests.kind,
    })
    .from(vacationRequests)
    .where(
      and(
        eq(vacationRequests.status, "aprobada"),
        lte(vacationRequests.fromDate, range.to),
        gte(vacationRequests.toDate, range.from),
        staffIds ? inArray(vacationRequests.staffId, staffIds) : undefined,
      ),
    )
    .orderBy(asc(vacationRequests.fromDate), asc(vacationRequests.staffId), asc(vacationRequests.id));
}
