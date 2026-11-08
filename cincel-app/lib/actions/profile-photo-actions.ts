"use server";

import { toActionResult } from "@/lib/actions/action-result";
import type { ActionResult } from "@/lib/types/schedule";
import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { deleteStaffPhoto } from "@/lib/repositories/preferences-repository";

/**
 * Profile photo (redesign BE §7.2). Upload and read are route handlers
 * (`/api/staff/me/photo`, `/api/staff/[id]/photo`); this file holds the
 * remove action.
 */

/**
 * Delete the caller's photo. Auth: staff. No layout revalidation: the client
 * sets `qk.me.profile()` to `photoUrl: null` (`useRemovePhotoMutation`).
 */
export async function removeMyPhotoAction(
  ...args: Parameters<typeof removeMyPhotoActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof removeMyPhotoActionImpl>>>> {
  return toActionResult(() => removeMyPhotoActionImpl(...args));
}

async function removeMyPhotoActionImpl(): Promise<void> {
  const user = await requireCapabilityUser();
  await deleteStaffPhoto(db, user.member.id);
}
