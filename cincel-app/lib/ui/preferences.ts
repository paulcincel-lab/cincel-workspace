/**
 * Appearance resolver (redesign BE §8.1, FE §15.1). Pure and client-safe;
 * the server-side reader is `lib/ui/preferences-server.ts`.
 */
import type { OrgAppearance, ResolvedAppearance, UserPreferences } from "@/lib/types/redesign";

/** Name of the appearance cookie: JSON `AppearanceCookie` (BE §8.2). */
export const APPEARANCE_COOKIE = "cincel-appearance";

/** Name of the portal style cookie (FE §3.11); portal users have no preferences row. */
export const PORTAL_STYLE_COOKIE = "cincel-portal-style";

/** A missing `user_preferences` row means these (BE §3.3). */
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: null,
  mode: "system",
  style: null,
  density: "comoda",
  textSize: 14,
  redesignEnabled: false,
  quietHours: null,
};

/**
 * Org + user → what the page renders (BE §8.1): theme (user override only when
 * allowed), tokens (org tokens for the base theme, else the preset), style,
 * mode / density / text size, `redesignEnabled = org.redesignAvailable &&
 * (user?.redesignEnabled ?? org.redesignDefault)`, `cssVars` and `version`.
 *
 * Contract stub: always resolves with the flag off (legacy pipeline), so the
 * root layout keeps rendering today's look until the resolver lands.
 */
export function resolveAppearance(
  org: OrgAppearance & { v?: number },
  user: UserPreferences | null,
): ResolvedAppearance {
  return {
    theme: org.baseTheme,
    mode: user?.mode ?? DEFAULT_USER_PREFERENCES.mode,
    style: org.styleDefault,
    density: user?.density ?? DEFAULT_USER_PREFERENCES.density,
    textSize: user?.textSize ?? DEFAULT_USER_PREFERENCES.textSize,
    redesignEnabled: false,
    cssVars: { light: {}, dark: {} },
    version: org.v ?? 1,
  };
}
