import "server-only";

import { db } from "@/lib/db";
import { findStaffPhoto } from "@/lib/repositories/preferences-repository";

/** `/api/staff/<id>/photo?v=<sha8>` (redesign BE §7.2): the URL the photo route returns after an upload. */
export function staffPhotoPath(staffId: string, sha256: string): string {
  return `/api/staff/${encodeURIComponent(staffId)}/photo?v=${sha256.slice(0, 8)}`;
}

/** The staff member's photo URL, or null when there is none or it cannot be read (the avatar shows initials). */
export async function staffPhotoUrl(staffId: string): Promise<string | null> {
  try {
    const photo = await findStaffPhoto(db, staffId);
    return photo ? staffPhotoPath(staffId, photo.sha256) : null;
  } catch (error) {
    console.error("[inicio] staff photo lookup failed", error);
    return null;
  }
}
