"use server";

import { notImplementedAction } from "@/lib/stubs";

/**
 * Profile photo (redesign BE §7.2). Upload and read are route handlers
 * (`/api/staff/me/photo`, `/api/staff/[id]/photo`); this file holds the
 * remove action.
 */

/** Delete the caller's photo. Auth: staff. Revalidates `/` (layout). */
export async function removeMyPhotoAction(): Promise<void> {
  return notImplementedAction("removeMyPhotoAction");
}
