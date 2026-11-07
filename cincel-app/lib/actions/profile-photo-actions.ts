"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { deleteStaffPhoto } from "@/lib/repositories/preferences-repository";

/**
 * Profile photo (redesign BE §7.2). Upload and read are route handlers
 * (`/api/staff/me/photo`, `/api/staff/[id]/photo`); this file holds the
 * remove action.
 */

/** Delete the caller's photo. Auth: staff. Revalidates `/` (layout). */
export async function removeMyPhotoAction(): Promise<void> {
  const user = await requireCapabilityUser();
  await deleteStaffPhoto(db, user.member.id);
  revalidatePath("/", "layout");
}
