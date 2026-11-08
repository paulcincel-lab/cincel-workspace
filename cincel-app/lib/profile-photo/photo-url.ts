import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db/client";
import { staffPhotos } from "@/lib/db/schema";

/**
 * The URL the shell and Ajustes › Perfil show for a stored photo (redesign BE
 * §7.2): `/api/staff/<id>/photo?v=<sha8>`, the same shape the upload route
 * returns, so a new upload changes the URL and skips the browser cache.
 */
export function staffPhotoUrl(staffId: string, sha256: string): string {
  return `/api/staff/${encodeURIComponent(staffId)}/photo?v=${sha256.slice(0, 8)}`;
}

/**
 * The staff member's photo URL, or null when they have none. Reads only the
 * sha (never the `bytes` blob); per-request cache for the layout, Inicio and
 * Perfil.
 */
export const getStaffPhotoUrl = cache(async function getStaffPhotoUrl(staffId: string): Promise<string | null> {
  const [row] = await db
    .select({ sha256: staffPhotos.sha256 })
    .from(staffPhotos)
    .where(eq(staffPhotos.staffId, staffId))
    .limit(1);
  return row ? staffPhotoUrl(staffId, row.sha256) : null;
});
