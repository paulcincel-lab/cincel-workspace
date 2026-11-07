/**
 * Notes and checklists queries the owner-scoped helper doesn't cover (redesign
 * BE §3.6, §7.5, §8.0.3): restoring an archived note (the helper has no undo
 * of `softDelete`) and checklist items, which carry no `staff_id` and are
 * reached through their parent checklist. Callers check the owner first.
 */
import { and, asc, eq, inArray, max, sql } from "drizzle-orm";

import { checklistItems, checklists, notes } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

export type ChecklistItemRow = typeof checklistItems.$inferSelect;

/** A note in any state (live or archived), with its owner; null when missing. */
export async function findNoteState(
  db: OwnerDb,
  id: string,
): Promise<{ staffId: string; deletedAt: Date | null } | null> {
  const [row] = await db
    .select({ staffId: notes.staffId, deletedAt: notes.deletedAt })
    .from(notes)
    .where(eq(notes.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Clears `deleted_at` of the caller's note. `updated_at` is written back as
 * it was, so the restored note keeps its place in the list.
 */
export async function restoreNote(db: OwnerDb, staffId: string, id: string): Promise<typeof notes.$inferSelect> {
  const [row] = await db
    .update(notes)
    .set({ deletedAt: null, updatedAt: sql`${notes.updatedAt}` })
    .where(and(eq(notes.id, id), eq(notes.staffId, staffId)))
    .returning();
  if (!row) throw new Error("NOT_FOUND");
  return row;
}

/** Items of the given checklists, by `sortOrder` (ties by creation). */
export async function listChecklistItems(db: OwnerDb, checklistIds: string[]): Promise<ChecklistItemRow[]> {
  if (checklistIds.length === 0) return [];
  return db
    .select()
    .from(checklistItems)
    .where(inArray(checklistItems.checklistId, checklistIds))
    .orderBy(asc(checklistItems.checklistId), asc(checklistItems.sortOrder), asc(checklistItems.createdAt));
}

/** An item with the owner and archive state of its checklist; null when missing. */
export async function findChecklistItemWithOwner(
  db: OwnerDb,
  itemId: string,
): Promise<{ item: ChecklistItemRow; staffId: string; checklistDeletedAt: Date | null } | null> {
  const [row] = await db
    .select({ item: checklistItems, staffId: checklists.staffId, checklistDeletedAt: checklists.deletedAt })
    .from(checklistItems)
    .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
    .where(eq(checklistItems.id, itemId))
    .limit(1);
  return row ?? null;
}

/** Appends items after the current last one (callers hold the checklist lock). */
export async function appendChecklistItems(
  db: OwnerDb,
  checklistId: string,
  texts: string[],
): Promise<ChecklistItemRow[]> {
  if (texts.length === 0) return [];
  const [last] = await db
    .select({ value: max(checklistItems.sortOrder) })
    .from(checklistItems)
    .where(eq(checklistItems.checklistId, checklistId));
  const start = last?.value == null ? 0 : last.value + 1;
  return db
    .insert(checklistItems)
    .values(texts.map((text, i) => ({ checklistId, text, sortOrder: start + i })))
    .returning();
}

export async function setChecklistItemDone(db: OwnerDb, itemId: string, done: boolean): Promise<ChecklistItemRow> {
  const [row] = await db.update(checklistItems).set({ done }).where(eq(checklistItems.id, itemId)).returning();
  if (!row) throw new Error("NOT_FOUND");
  return row;
}

/** Writes `sortOrder = index` for each id (callers checked the ids belong to the checklist). */
export async function setChecklistItemOrder(db: OwnerDb, checklistId: string, ids: string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    await db
      .update(checklistItems)
      .set({ sortOrder: index })
      .where(and(eq(checklistItems.id, id), eq(checklistItems.checklistId, checklistId)));
  }
}
