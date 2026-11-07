"use server";

import { notImplementedAction, stubDefault } from "@/lib/stubs";
import type { OrgAppearance, ThemeId } from "@/lib/types/redesign";
import { DEFAULT_ORG_APPEARANCE } from "@/lib/ui/themes";

/**
 * Organization appearance (redesign BE §7.1). Phase 1 contract stubs; guards
 * follow `app-settings-actions.ts` when implemented.
 */

/** The stored org appearance (Azul preset when missing). Auth: staff. */
export async function fetchOrgAppearanceAction(): Promise<OrgAppearance> {
  return stubDefault(DEFAULT_ORG_APPEARANCE);
}

/**
 * Store the full org appearance (no partial merge) and bump its version `v`.
 * Auth: `canManageAppearance`. Errors: `FORBIDDEN`, `INVALID`,
 * `LOW_CONTRAST: <pair> <mode> <ratio>[, …]`. Revalidates `/` (layout).
 */
export async function saveOrgAppearanceAction(input: OrgAppearance): Promise<OrgAppearance> {
  return notImplementedAction("saveOrgAppearanceAction", input);
}

/**
 * Reset tokens, type scale and shape to the `base` preset, keeping the style
 * and flag settings. Auth: `canManageAppearance`. Errors: `FORBIDDEN`.
 */
export async function resetOrgAppearanceAction(base: ThemeId): Promise<OrgAppearance> {
  return notImplementedAction("resetOrgAppearanceAction", base);
}
