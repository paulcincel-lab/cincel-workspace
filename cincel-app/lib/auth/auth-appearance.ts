import "server-only";

import { getGeneralSettings } from "@/lib/settings/general-settings-server";

/**
 * Server reads for the auth pages (`/login`, `/login/denegado`,
 * `/change-password`; FE §3.10). These pages render before a staff session
 * exists, so they read only what they need and never company details.
 */

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
