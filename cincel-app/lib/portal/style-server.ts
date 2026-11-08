import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import type { OrgAppearance, PresentationStyle } from "@/lib/types/redesign";
import { getStoredOrgAppearance } from "@/lib/ui/preferences-server";

import { PORTAL_STYLE_COOKIE, resolvePortalStyle } from "./style";

/**
 * The org's style policy: default style and whether a client may pick another one. Read from the per-request
 * cached `appearance.theme` row (`getStoredOrgAppearance`, shared with the root layout and
 * `getPortalAppearance`: one read per request); Azul defaults on a DB error.
 */
export const getPortalStylePolicy = cache(async (): Promise<Pick<OrgAppearance, "styleDefault" | "allowUserOverride">> => {
  const org = await getStoredOrgAppearance();
  return { styleDefault: org.styleDefault, allowUserOverride: org.allowUserOverride };
});

export type PortalPresentation = {
  style: PresentationStyle;
  /** True when the organization fixed the style; the cookie is then ignored. */
  fixedByOrg: boolean;
};

/**
 * Presentation style for this portal request (FE §3.11, §15.1): the `cincel-portal-style` cookie when it holds
 * a known style and the organization allows a personal style, else the org default. Cached per request, so the
 * layout and the page agree.
 */
export const getPortalPresentation = cache(async (): Promise<PortalPresentation> => {
  const [policy, cookieStore] = await Promise.all([getPortalStylePolicy(), cookies()]);
  return {
    style: resolvePortalStyle(cookieStore.get(PORTAL_STYLE_COOKIE)?.value, policy),
    fixedByOrg: !policy.allowUserOverride,
  };
});
