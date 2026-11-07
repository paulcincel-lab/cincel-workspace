import "server-only";

import { z } from "zod";

import { getAppSettingEntry } from "@/lib/repositories/app-settings-repository";
import { getGeneralSettings } from "@/lib/settings/general-settings-server";
import { DEFAULT_ORG_APPEARANCE } from "@/lib/ui/themes";

/**
 * Server reads for the auth pages (`/login`, `/login/denegado`,
 * `/change-password`; FE §3.10, Phase 8). These pages render before a staff
 * session exists, so they cannot call the staff-only `fetchOrgAppearanceAction`
 * or know the per-user flag: they read the two org flags straight from
 * `app_settings('appearance.theme')` and render the redesign look when
 * `redesignAvailable && redesignDefault` (the resolver's rule with no user row,
 * FE §2.3). Any read or parse problem keeps today's look.
 */

const APPEARANCE_SETTING_KEY = "appearance.theme";

/** Only the flags are needed here; the rest of the stored value is ignored. */
const StoredAppearanceFlagsSchema = z.object({
  data: z.object({
    redesignDefault: z.boolean(),
    redesignAvailable: z.boolean(),
  }),
});

export type AuthAppearanceFlags = { redesignDefault: boolean; redesignAvailable: boolean };

/** The org redesign flags, or the Azul defaults (redesign off) when missing or unreadable. */
export async function getOrgRedesignFlags(): Promise<AuthAppearanceFlags> {
  const fallback = {
    redesignDefault: DEFAULT_ORG_APPEARANCE.redesignDefault,
    redesignAvailable: DEFAULT_ORG_APPEARANCE.redesignAvailable,
  };
  try {
    const entry = await getAppSettingEntry(APPEARANCE_SETTING_KEY);
    if (!entry) return fallback;
    const parsed = StoredAppearanceFlagsSchema.safeParse(JSON.parse(entry.value));
    return parsed.success ? parsed.data.data : fallback;
  } catch (error) {
    console.error("[auth] could not read the organization appearance", error);
    return fallback;
  }
}

/** Whether an auth page without a session renders the redesign look. */
export function authRedesignOn(flags: AuthAppearanceFlags): boolean {
  return flags.redesignAvailable && flags.redesignDefault;
}

/** `true` when the org renders the redesign look on the auth pages. */
export async function isAuthRedesignOn(): Promise<boolean> {
  return authRedesignOn(await getOrgRedesignFlags());
}

/** One plain address: no spaces, separators or `?` / `&` that would add mailto fields. */
const SIMPLE_EMAIL = /^[^\s@<>"(),;:\\?&#%]+@[^\s@<>"(),;:\\?&#%]+\.[^\s@<>"(),;:\\?&#%]+$/;

/** A usable `contactEmail`, or `""` when it is empty or not an email address. */
export function normalizeContactEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  const email = value.trim();
  return SIMPLE_EMAIL.test(email) ? email : "";
}

/**
 * General settings `company.contactEmail` (Phase 1 field) for the denied page's
 * "Contactar al administrador" link; `""` when unset, invalid or unreadable.
 * Only this one address is read, so no other company detail reaches a page
 * rendered without a session.
 */
export async function getAdminContactEmail(): Promise<string> {
  try {
    const { settings } = await getGeneralSettings();
    const company = settings.company as unknown as Record<string, unknown>;
    return normalizeContactEmail(company.contactEmail);
  } catch (error) {
    console.error("[auth] could not read the contact email", error);
    return "";
  }
}

/** `mailto:` for "Contactar al administrador". */
export function adminContactHref(email: string): string {
  return `mailto:${email}?subject=${encodeURIComponent("Acceso a Cincel Workspace")}`;
}
