"use server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { findUserPreferences, upsertUserPreferences } from "@/lib/repositories/preferences-repository";
import type { ResolvedAppearance, UserPreferences } from "@/lib/types/redesign";
import {
  getStoredOrgAppearance,
  rowToResolverInput,
  rowToUserPreferences,
  writeAppearanceCookie,
} from "@/lib/ui/preferences-server";
import { resolveAppearance } from "@/lib/ui/preferences";
import { parseInput, UserPreferencesPatchSchema } from "@/lib/validation/redesign";

/**
 * User preferences (redesign BE §7.1). Rows are keyed by the session staff id;
 * a missing row means the defaults.
 */

/** The caller's preferences; defaults when no row exists. Auth: staff. */
export async function fetchMyPreferencesAction(): Promise<UserPreferences> {
  const user = await requireCapabilityUser();
  const [org, row] = await Promise.all([getStoredOrgAppearance(), findUserPreferences(db, user.member.id)]);
  return rowToUserPreferences(row, org);
}

/**
 * Patch the caller's preferences (`UserPreferencesPatchSchema`), rewrite the
 * `cincel-appearance` cookie and return the resolved appearance so the client
 * applies it without a round-trip. No revalidation.
 * Errors: `INVALID`, `OVERRIDE_DISABLED` (theme or style while the org fixed
 * them), `DISABLED` (`redesignEnabled: true` while `redesignAvailable` is off).
 */
export async function updateMyPreferencesAction(
  patch: Partial<UserPreferences>,
): Promise<{ preferences: UserPreferences; appearance: ResolvedAppearance }> {
  const user = await requireCapabilityUser();
  const input = parseInput(UserPreferencesPatchSchema, patch);
  const org = await getStoredOrgAppearance();

  if (!org.allowUserOverride && (input.theme != null || input.style != null)) {
    throw new Error("OVERRIDE_DISABLED");
  }
  if (input.redesignEnabled === true && !org.redesignAvailable) {
    throw new Error("DISABLED");
  }

  const values: Parameters<typeof upsertUserPreferences>[2] = {};
  if (input.theme !== undefined) values.theme = input.theme;
  if (input.mode !== undefined) values.mode = input.mode;
  if (input.style !== undefined) values.style = input.style;
  if (input.density !== undefined) values.density = input.density;
  if (input.textSize !== undefined) values.textSize = input.textSize;
  if (input.redesignEnabled !== undefined) values.redesignEnabled = input.redesignEnabled;
  if (input.quietHours !== undefined) {
    values.quietFrom = input.quietHours?.from ?? null;
    values.quietTo = input.quietHours?.to ?? null;
  }

  const row = await upsertUserPreferences(db, user.member.id, values);
  const appearance = resolveAppearance(org, rowToResolverInput(row));
  await writeAppearanceCookie(appearance);
  return { preferences: rowToUserPreferences(row, org), appearance };
}
