/**
 * Phase 1 read helper (redesign BE §8.12): the caller's open reminders of one
 * local day as agenda items (Inicio "Mi día"). Empty until reminders exist.
 */
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";
import type { AgendaItem } from "@/lib/types/widgets";

export async function remindersForDay(db: OwnerDb, staffId: string, date: string): Promise<AgendaItem[]> {
  return notImplemented("remindersForDay", db, staffId, date);
}
