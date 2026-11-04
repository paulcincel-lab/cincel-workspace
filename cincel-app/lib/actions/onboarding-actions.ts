"use server";

import { revalidatePath } from "next/cache";

import { getSessionAccess } from "@/lib/auth/session";
import * as onboardingRepository from "@/lib/repositories/onboarding-repository";

/**
 * Finishes or skips the signed-in staff member's first-login wizard (#671, #672). Only ever touches the caller's
 * own row; the wizard pages guard their own role.
 */
export async function completeOnboardingAction(): Promise<{ ok: true } | { ok: false; error: "forbidden" }> {
  let staffId: string | null = null;
  try {
    const access = await getSessionAccess();
    if (access.status === "active" && access.user) staffId = access.user.id;
  } catch {
    staffId = null;
  }
  if (!staffId) return { ok: false, error: "forbidden" };

  await onboardingRepository.markOnboardingCompleted(staffId);
  revalidatePath("/dashboard");
  return { ok: true };
}
