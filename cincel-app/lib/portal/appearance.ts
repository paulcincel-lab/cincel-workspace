import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";

import { parseStoredOrgAppearance, ORG_APPEARANCE_SETTING_KEY, type PortalOrgAppearance } from "@/lib/portal/appearance-scope";
import { db } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";
import type { ResolvedAppearance } from "@/lib/types/redesign";
import { resolveAppearance } from "@/lib/ui/preferences";
import { DEFAULT_ORG_APPEARANCE } from "@/lib/ui/themes";

/** Portal code reads `app_settings` directly: the staff repositories are off limits here (eslint portal boundary). */
async function readOrgAppearance(): Promise<PortalOrgAppearance> {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, ORG_APPEARANCE_SETTING_KEY));
    return parseStoredOrgAppearance(row?.value ?? null) ?? DEFAULT_ORG_APPEARANCE;
  } catch (error) {
    console.error("[portal] could not read the organization appearance", error);
    return DEFAULT_ORG_APPEARANCE;
  }
}

/**
 * What the portal renders (FE §3.11): the organization appearance resolved with no user row, so a client never
 * gets a theme, mode or style override. Cached per request (layout and page share one read).
 */
export const getPortalAppearance = cache(async (): Promise<ResolvedAppearance> => {
  return resolveAppearance(await readOrgAppearance(), null);
});
