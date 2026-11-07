/**
 * Phase 1 read helper (redesign BE §8.12): approved vacation requests
 * overlapping `[from, to]`. None until requests exist.
 */
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";
import type { VacationKind } from "@/lib/types/redesign";

export async function approvedAbsences(
  db: OwnerDb,
  range: { from: string; to: string; staffIds?: string[] },
): Promise<{ staffId: string; from: string; to: string; kind: VacationKind }[]> {
  return notImplemented("approvedAbsences", db, range);
}
