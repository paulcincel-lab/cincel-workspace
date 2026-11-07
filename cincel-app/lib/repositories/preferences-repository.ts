/**
 * `user_preferences` and `staff_photos` (redesign BE §3.3, §3.4, §7.1, §7.2).
 * Rows are keyed by the session staff id.
 */
import { staffPhotos, userPreferences } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";

export type UserPreferencesRow = typeof userPreferences.$inferSelect;
export type StaffPhotoRow = typeof staffPhotos.$inferSelect;

/** The caller's row, or null (= all defaults). */
export async function findUserPreferences(db: OwnerDb, staffId: string): Promise<UserPreferencesRow | null> {
  return notImplemented("findUserPreferences", db, staffId);
}

export async function upsertUserPreferences(
  db: OwnerDb,
  staffId: string,
  values: Partial<Omit<typeof userPreferences.$inferInsert, "staffId">>,
): Promise<UserPreferencesRow> {
  return notImplemented("upsertUserPreferences", db, staffId, values);
}

export async function findStaffPhoto(db: OwnerDb, staffId: string): Promise<StaffPhotoRow | null> {
  return notImplemented("findStaffPhoto", db, staffId);
}

export async function upsertStaffPhoto(
  db: OwnerDb,
  staffId: string,
  photo: { mime: string; bytes: Buffer; sha256: string },
): Promise<StaffPhotoRow> {
  return notImplemented("upsertStaffPhoto", db, staffId, photo);
}

export async function deleteStaffPhoto(db: OwnerDb, staffId: string): Promise<void> {
  return notImplemented("deleteStaffPhoto", db, staffId);
}
