import { type GeneralSettings, isContactEmail, isHttpsUrl } from "@/lib/settings/general-settings";

/**
 * Avatar-menu link fields of Ajustes › General (redesign FE §3.8, BE §3.12):
 * Instagram, Sitio web and Correo in `general_settings.company`, and their
 * inline validation.
 */

/** The company fields behind the avatar-menu links. */
export type HeaderLinkFields = {
  instagramUrl: string | null;
  website: string | null;
  contactEmail: string | null;
};

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
