/**
 * `user_preferences` and `staff_photos` (redesign BE §3.3, §3.4, §7.1, §7.2).
 * Rows are keyed by the session staff id.
 */
import { eq, sql } from "drizzle-orm";
import { cache } from "react";

import { staffPhotos, userPreferences } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

export type UserPreferencesRow = typeof userPreferences.$inferSelect;
export type StaffPhotoRow = typeof staffPhotos.$inferSelect;

/**
 * The caller's row, or null (= all defaults). Per-request cache, so
 * `getResolvedAppearance` and `fetchMyPreferencesAction` share one read in a
 * render (no cache inside a Server Action body, so a write is seen at once).
 */
export const findUserPreferences = cache(async function findUserPreferences(
  db: OwnerDb,
  staffId: string,
): Promise<UserPreferencesRow | null> {
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.staffId, staffId)).limit(1);
  return row ?? null;
});

/** Insert the caller's row or merge `values` into it; omitted columns keep their value (or default). */
export async function upsertUserPreferences(
  db: OwnerDb,
  staffId: string,
  values: Partial<Omit<typeof userPreferences.$inferInsert, "staffId">>,
): Promise<UserPreferencesRow> {
  const [row] = await db
    .insert(userPreferences)
    .values({ ...values, staffId })
    .onConflictDoUpdate({ target: userPreferences.staffId, set: { ...values, updatedAt: new Date() } })
    .returning();
  return row;
}

/**
 * Sets (`widths`) or forgets (`null`) one table's remembered column widths in
 * the caller's row, creating the row when missing. One atomic statement on the
 * jsonb column, so two tables saved at once never overwrite each other.
 */
export async function setTableColumnWidths(
  db: OwnerDb,
  staffId: string,
  tableId: string,
  widths: Record<string, number> | null,
): Promise<UserPreferencesRow> {
  const column = userPreferences.tableColumnWidths;
  const next = widths
    ? sql`jsonb_set(coalesce(${column}, '{}'::jsonb), array[${tableId}::text], ${JSON.stringify(widths)}::jsonb, true)`
    : sql`coalesce(${column}, '{}'::jsonb) - ${tableId}::text`;
  const [row] = await db
    .insert(userPreferences)
    .values({ staffId, tableColumnWidths: widths ? { [tableId]: widths } : {} })
    .onConflictDoUpdate({ target: userPreferences.staffId, set: { tableColumnWidths: next, updatedAt: new Date() } })
    .returning();
  return row;
}

export async function findStaffPhoto(db: OwnerDb, staffId: string): Promise<StaffPhotoRow | null> {
  const [row] = await db.select().from(staffPhotos).where(eq(staffPhotos.staffId, staffId)).limit(1);
  return row ?? null;
}

export async function upsertStaffPhoto(
  db: OwnerDb,
  staffId: string,
  photo: { mime: string; bytes: Buffer; sha256: string },
): Promise<StaffPhotoRow> {
  const [row] = await db
    .insert(staffPhotos)
    .values({ staffId, mime: photo.mime, bytes: photo.bytes, sha256: photo.sha256 })
    .onConflictDoUpdate({
      target: staffPhotos.staffId,
      set: { mime: photo.mime, bytes: photo.bytes, sha256: photo.sha256, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function deleteStaffPhoto(db: OwnerDb, staffId: string): Promise<void> {
  await db.delete(staffPhotos).where(eq(staffPhotos.staffId, staffId));
}
