"use server";

import { DEFAULT_USER_PREFERENCES } from "@/lib/ui/preferences";
import { notImplementedAction, stubDefault } from "@/lib/stubs";
import type { ResolvedAppearance, UserPreferences } from "@/lib/types/redesign";

/**
 * User preferences (redesign BE §7.1). Phase 1 contract stubs: the read
 * returns the defaults; the write throws `NOT_IMPLEMENTED` until its issue
 * lands (flags in `preferences-actions.flags.ts`).
 */

/** The caller's preferences; defaults when no row exists. Auth: staff. */
export async function fetchMyPreferencesAction(): Promise<UserPreferences> {
  return stubDefault({ ...DEFAULT_USER_PREFERENCES });
}

/**
 * Patch the caller's preferences (`UserPreferencesPatchSchema`), rewrite the
 * `cincel-appearance` cookie and return the resolved appearance so the client
 * applies it without a round-trip. No revalidation.
 * Errors: `INVALID`, `OVERRIDE_DISABLED`, `DISABLED`.
 */
export async function updateMyPreferencesAction(
  patch: Partial<UserPreferences>,
): Promise<{ preferences: UserPreferences; appearance: ResolvedAppearance }> {
  return notImplementedAction("updateMyPreferencesAction", patch);
}
