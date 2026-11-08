"use server";

import { revalidatePath } from "next/cache";

import { canManageAppearance } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import * as orgAppearanceRepository from "@/lib/repositories/org-appearance-repository";
import type { OrgAppearance, ThemeId } from "@/lib/types/redesign";
import { checkContrast } from "@/lib/ui/contrast";
import { getStoredOrgAppearance, withoutVersion } from "@/lib/ui/preferences-server";
import { DEFAULT_ORG_APPEARANCE, THEME_PRESETS } from "@/lib/ui/themes";
import { OrgAppearanceSchema, parseInput, ThemeIdSchema } from "@/lib/validation/redesign";

/**
 * Organization appearance (redesign BE §7.1). Guards follow
 * `app-settings-actions.ts`; the value lives in `app_settings('appearance.theme')`
 * (`lib/repositories/org-appearance-repository.ts`).
 */

/** The stored org appearance (Azul preset when missing). Auth: staff. */
export async function fetchOrgAppearanceAction(): Promise<OrgAppearance> {
  await requireCapabilityUser();
  return withoutVersion(await getStoredOrgAppearance());
}

/**
 * Store the full org appearance (no partial merge) and bump its version `v`.
 * Auth: `canManageAppearance`. Errors: `FORBIDDEN`, `INVALID`,
 * `LOW_CONTRAST: <pair> <mode> <ratio>[, …]`. Revalidates `/` (layout).
 */
export async function saveOrgAppearanceAction(input: OrgAppearance): Promise<OrgAppearance> {
  const user = await requireCapabilityUser();
  if (!canManageAppearance(user)) throw new Error("FORBIDDEN: appearance edit");
  const appearance = parseInput(OrgAppearanceSchema, input);
  const failing = (["light", "dark"] as const).flatMap((mode) =>
    checkContrast(appearance.tokens, mode).filter((result) => !result.ok),
  );
  if (failing.length > 0) {
    throw new Error(
      `LOW_CONTRAST: ${failing.map((result) => `${result.pair} ${result.mode} ${formatRatio(result.ratio)}`).join(", ")}`,
    );
  }
  const stored = await orgAppearanceRepository.writeOrgAppearance(() => appearance);
  revalidatePath("/", "layout");
  return withoutVersion(stored);
}

/**
 * Reset tokens, type scale and shape to the `base` preset, keeping the style
 * settings. Auth: `canManageAppearance`. Errors: `FORBIDDEN`.
 */
export async function resetOrgAppearanceAction(base: ThemeId): Promise<OrgAppearance> {
  const user = await requireCapabilityUser();
  if (!canManageAppearance(user)) throw new Error("FORBIDDEN: appearance edit");
  const theme = parseInput(ThemeIdSchema, base);
  const stored = await orgAppearanceRepository.writeOrgAppearance((current) => {
    const kept = current ?? DEFAULT_ORG_APPEARANCE;
    return {
      ...structuredClone(THEME_PRESETS[theme]),
      styleDefault: kept.styleDefault,
      allowUserOverride: kept.allowUserOverride,
    };
  });
  revalidatePath("/", "layout");
  return withoutVersion(stored);
}

/** Two decimals, rounded down so a failing ratio never reads as passing (4.497 → "4.49"). */
function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2);
}
