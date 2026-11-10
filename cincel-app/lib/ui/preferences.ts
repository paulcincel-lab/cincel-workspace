/**
 * Appearance resolver (redesign BE §8.1, FE §15.1). Pure and client-safe;
 * the server-side reader is `lib/ui/preferences-server.ts`.
 */
import type { AppearanceCookie, OrgAppearance, ResolvedAppearance, UserPreferences } from "@/lib/types/redesign";
import { toCssVars } from "@/lib/ui/appearance-css";
import { presetFilledTokens, THEME_PRESETS } from "@/lib/ui/themes";

/** Name of the appearance cookie: JSON `AppearanceCookie` (BE §8.2). */
export const APPEARANCE_COOKIE = "cincel-appearance";

/** Name of the portal style cookie (FE §3.11); portal users have no preferences row. */
export const PORTAL_STYLE_COOKIE = "cincel-portal-style";

/** A missing `user_preferences` row means these (BE §3.3). */
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: null,
  mode: "light",
  style: null,
  density: "comoda",
  textSize: 14,
  quietHours: null,
};

/** Preference key of "Ocultar completadas" in the task tables (#1039). */
export const HIDE_COMPLETED_PREFERENCE_KEY = "hideCompletedTasks" satisfies keyof UserPreferences;
/** Completed tasks are shown until the user hides them. */
export const DEFAULT_HIDE_COMPLETED_TASKS = false;

/** Lifetime of the appearance cookie (BE §8.2). */
const APPEARANCE_COOKIE_MAX_AGE_DAYS = 365;

/** Cookie options of `cincel-appearance` (BE §8.2): readable by the client, Lax, one year, unsigned. */
export const APPEARANCE_COOKIE_OPTIONS = {
  httpOnly: false,
  sameSite: "lax" as const,
  path: "/",
  maxAge: APPEARANCE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
};

/**
 * Org + user → what the page renders (BE §8.1):
 * 1. theme: the user's only when `allowUserOverride`, else `org.baseTheme`;
 * 2. tokens: the org tokens for the base theme, else the preset (a user theme
 *    never inherits the org's token edits of another base);
 * 3. style: the user's only when `allowUserOverride`, else `org.styleDefault`;
 * 4. mode / density / text size from the user (defaults `light`, `comoda`, 14);
 * 5. `cssVars` for both modes and `version = org.v`.
 */
export function resolveAppearance(org: OrgAppearance & { v?: number }, user: UserPreferences | null): ResolvedAppearance {
  const theme = org.allowUserOverride && user?.theme ? user.theme : org.baseTheme;
  const tokens = theme === org.baseTheme ? presetFilledTokens(org.baseTheme, org.tokens) : THEME_PRESETS[theme].tokens;
  const style = org.allowUserOverride && user?.style ? user.style : org.styleDefault;
  const mode = user?.mode ?? DEFAULT_USER_PREFERENCES.mode;
  const density = user?.density ?? DEFAULT_USER_PREFERENCES.density;
  const textSize = user?.textSize ?? DEFAULT_USER_PREFERENCES.textSize;

  const effective: OrgAppearance = { ...org, baseTheme: theme, tokens };
  return {
    theme,
    mode,
    style,
    density,
    textSize,
    cssVars: { light: toCssVars(effective, "light", textSize), dark: toCssVars(effective, "dark", textSize) },
    version: org.v ?? 1,
  };
}

/** The cookie value for a resolved appearance (BE §8.2). */
export function appearanceCookieValue(appearance: ResolvedAppearance): AppearanceCookie {
  return {
    theme: appearance.theme,
    mode: appearance.mode,
    style: appearance.style,
    density: appearance.density,
    textSize: appearance.textSize,
    v: appearance.version,
  };
}

/** Serialized `cincel-appearance` cookie. */
export function serializeAppearanceCookie(appearance: ResolvedAppearance): string {
  return JSON.stringify(appearanceCookieValue(appearance));
}
