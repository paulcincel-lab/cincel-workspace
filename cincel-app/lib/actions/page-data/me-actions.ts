"use server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { getStaffPhotoUrl } from "@/lib/profile-photo/photo-url";
import type { MyProfile } from "@/lib/types/shell";

/**
 * `qk.me.profile()` (plan §5 Phase 1b, S2). Takes no input: the staff id
 * always comes from the session, so a caller only ever reads their own
 * profile. Auth: staff.
 */
export async function fetchMyProfileAction(): Promise<MyProfile> {
  const user = await requireCapabilityUser();
  const id = user.member.id;
  return { id, name: user.member.name, photoUrl: await getStaffPhotoUrl(id) };
}
