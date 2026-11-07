import {
  GENERAL_SETTINGS_DEFAULTS,
  type GeneralSettings,
  isContactEmail,
  isHttpsUrl,
} from "@/lib/settings/general-settings";

/**
 * One-time pickup of the avatar-menu links that used to live in this browser
 * (redesign FE §3.8, BE §3.12, RD-12). The legacy header saved Instagram /
 * Sitio web / Correo under `cincel.header.links.v1`; Ajustes › General reads
 * that key once, offers the values for saving in `general_settings.company`
 * and from then on ignores it. The legacy header (flag off) keeps using the
 * key until the Cleanup phase, so it is not deleted here: a marker key records
 * that the pickup already happened.
 */
export const LEGACY_HEADER_LINKS_STORAGE_KEY = "cincel.header.links.v1";
export const HEADER_LINKS_MIGRATED_STORAGE_KEY = "cincel.header.links.migrated.v1";

/** The company fields behind the avatar-menu links. */
export type HeaderLinkFields = {
  instagramUrl: string | null;
  website: string | null;
  contactEmail: string | null;
};

function readKey(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private window): the pickup simply runs again next time.
  }
}

function httpsOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && isHttpsUrl(trimmed) ? trimmed : null;
}

function emailOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^mailto:/i, "");
  return trimmed && isContactEmail(trimmed) ? trimmed : null;
}

/**
 * The usable values of a stored legacy links JSON, or null when nothing is
 * usable. The legacy "Correo" button held a URL (by default Gmail's inbox);
 * only a real address (optionally `mailto:`) becomes `contactEmail`.
 */
export function parseLegacyHeaderLinks(raw: string | null): HeaderLinkFields | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Record<string, unknown>;
  const links: HeaderLinkFields = {
    instagramUrl: httpsOrNull(candidate.instagram),
    website: httpsOrNull(candidate.website),
    contactEmail: emailOrNull(candidate.email),
  };
  return links.instagramUrl || links.website || links.contactEmail ? links : null;
}

/** The legacy links of this browser, or null when there are none or they were already picked up. */
export function readLegacyHeaderLinksOnce(): HeaderLinkFields | null {
  if (readKey(HEADER_LINKS_MIGRATED_STORAGE_KEY)) return null;
  return parseLegacyHeaderLinks(readKey(LEGACY_HEADER_LINKS_STORAGE_KEY));
}

/** Record that the legacy links were picked up; later loads ignore the legacy key. */
export function markLegacyHeaderLinksMigrated(): void {
  writeKey(HEADER_LINKS_MIGRATED_STORAGE_KEY, new Date().toISOString());
}

/**
 * Fill the empty link fields of `settings` from the legacy values. A field the
 * server already holds wins; the website only counts as empty while the
 * company still has the default settings (no saved row) or the field is blank.
 * Returns the settings unchanged (same object) when nothing applies.
 */
export function applyLegacyHeaderLinks(
  settings: GeneralSettings,
  legacy: HeaderLinkFields,
  options: { hasCustom: boolean },
): { settings: GeneralSettings; applied: boolean } {
  const company = { ...settings.company };
  let applied = false;

  if (!company.instagramUrl && legacy.instagramUrl) {
    company.instagramUrl = legacy.instagramUrl;
    applied = true;
  }
  if (!company.contactEmail && legacy.contactEmail) {
    company.contactEmail = legacy.contactEmail;
    applied = true;
  }
  const websiteIsEmpty =
    company.website.trim() === "" ||
    (!options.hasCustom && company.website === GENERAL_SETTINGS_DEFAULTS.company.website);
  if (websiteIsEmpty && legacy.website && legacy.website !== company.website) {
    company.website = legacy.website;
    applied = true;
  }

  return applied ? { settings: { ...settings, company }, applied } : { settings, applied };
}

export type HeaderLinkErrors = Partial<Record<keyof HeaderLinkFields, string>>;

export const HTTPS_URL_ERROR = "Escribe una dirección completa que empiece con https://.";
export const CONTACT_EMAIL_ERROR = "Escribe un correo válido, por ejemplo contacto@cincel.mx.";

/** Inline errors of the three link fields; an empty field is valid (the link is hidden). */
export function headerLinkErrors(company: GeneralSettings["company"]): HeaderLinkErrors {
  const errors: HeaderLinkErrors = {};
  const instagram = company.instagramUrl?.trim() ?? "";
  const website = company.website.trim();
  const email = company.contactEmail?.trim() ?? "";
  if (instagram && !isHttpsUrl(instagram)) errors.instagramUrl = HTTPS_URL_ERROR;
  if (website && !isHttpsUrl(website)) errors.website = HTTPS_URL_ERROR;
  if (email && !isContactEmail(email)) errors.contactEmail = CONTACT_EMAIL_ERROR;
  return errors;
}
