import "server-only";

import { getStaffPhotoUrl } from "@/lib/profile-photo/photo-url";

/** `/api/staff/<id>/photo?v=<sha8>` (redesign BE §7.2): the URL the photo route returns after an upload. */
export function staffPhotoPath(staffId: string, sha256: string): string {
  return `/api/staff/${encodeURIComponent(staffId)}/photo?v=${sha256.slice(0, 8)}`;
}

/** The staff member's photo URL, or null when there is none or it cannot be read (the avatar shows initials). */
export async function staffPhotoUrl(staffId: string): Promise<string | null> {
  try {
    // Sha-only, request-cached read shared with the staff layout.
    return await getStaffPhotoUrl(staffId);
  } catch (error) {
    console.error("[inicio] staff photo lookup failed", error);
    return null;
  }
}
