import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";
import { getPortalAppearance } from "@/lib/portal/appearance";
import { ORG_APPEARANCE_SETTING_KEY, parseStoredOrgAppearance } from "@/lib/portal/appearance-scope";
import type { OrgAppearance, PresentationStyle } from "@/lib/types/redesign";
import { DEFAULT_ORG_APPEARANCE } from "@/lib/ui/themes";

import { PORTAL_STYLE_COOKIE, resolvePortalStyle } from "./style";

/** The org's style policy: default style and whether a client may pick another one. Azul defaults on error. */
export const getPortalStylePolicy = cache(async (): Promise<Pick<OrgAppearance, "styleDefault" | "allowUserOverride">> => {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, ORG_APPEARANCE_SETTING_KEY))
      .limit(1);
    const org = parseStoredOrgAppearance(row?.value ?? null) ?? DEFAULT_ORG_APPEARANCE;
    return { styleDefault: org.styleDefault, allowUserOverride: org.allowUserOverride };
  } catch (error) {
    console.error("[portal] could not read the organization style", error);
    return { styleDefault: DEFAULT_ORG_APPEARANCE.styleDefault, allowUserOverride: DEFAULT_ORG_APPEARANCE.allowUserOverride };
  }
});

export type PortalPresentation = {
  /** False renders the portal exactly as before the redesign: no style switch, no styled project page. */
  redesignEnabled: boolean;
  style: PresentationStyle;
  /** True when the organization fixed the style; the cookie is then ignored. */
  fixedByOrg: boolean;
};

/**
 * Redesign flag and presentation style for this portal request (FE §3.11, §15.1). The flag and the theme come
 * from the organization appearance (`getPortalAppearance`, no user row); the style is the `cincel-portal-style`
 * cookie when it holds a known style and the organization allows a personal style, else the org default.
 * Cached per request, so the layout and the page agree.
 */
export const getPortalPresentation = cache(async (): Promise<PortalPresentation> => {
  const [appearance, policy, cookieStore] = await Promise.all([getPortalAppearance(), getPortalStylePolicy(), cookies()]);
  return {
    redesignEnabled: appearance.redesignEnabled,
    style: resolvePortalStyle(cookieStore.get(PORTAL_STYLE_COOKIE)?.value, policy),
    fixedByOrg: !policy.allowUserOverride,
  };
});
