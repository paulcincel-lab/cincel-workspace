import "server-only";

import { cache } from "react";

import type { ResolvedAppearance } from "@/lib/types/redesign";
import { resolveAppearance } from "@/lib/ui/preferences";
import { getStoredOrgAppearance } from "@/lib/ui/preferences-server";

/**
 * What the portal renders (FE §3.11): the organization appearance resolved with no user row, so a client never
 * gets a theme, mode or style override. Cached per request (layout and page share one read).
 *
 * The org setting comes from `getStoredOrgAppearance`, the per-request cached read of `appearance.theme` the
 * root layout already makes (Azul defaults on a DB error), so a portal request reads that row once
 * (Query Migration Phase 11). `getPortalStylePolicy` reads the same cached value.
 */
export const getPortalAppearance = cache(async (): Promise<ResolvedAppearance> => {
  return resolveAppearance(await getStoredOrgAppearance(), null);
});
