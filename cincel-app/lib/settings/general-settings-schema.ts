import { z } from "zod";

import {
  GENERAL_SETTINGS_LOGO_MAX_BYTES,
  type GeneralSettings,
  isContactEmail,
  isHttpsUrl,
} from "@/lib/settings/general-settings";

const TEXT_MAX = 300;
const LOGO_DATA_URL = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Decoded size of a base64 payload, in bytes. */
function base64Bytes(payload: string): number {
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

/** A logo is empty, a same-site path (e.g. /favicon.ico) or a PNG/JPG data URL within the size limit. */
export function isValidLogoValue(value: string): boolean {
  if (value === "") return true;
  if (value.startsWith("/") && !value.startsWith("//")) return value.length <= TEXT_MAX && !/\s/.test(value);
  const match = LOGO_DATA_URL.exec(value);
  return Boolean(match) && base64Bytes(match![2]) <= GENERAL_SETTINGS_LOGO_MAX_BYTES;
}

const text = z.string().max(TEXT_MAX);
const logo = z.string().refine(isValidLogoValue);

/**
 * An optional company link: a missing key (settings saved before the field
 * existed), null or a blank string all become null; anything else must match
 * the shape check.
 */
function optionalLink(isValid: (value: string) => boolean) {
  return z
    .string()
    .trim()
    .max(TEXT_MAX)
    .refine((value) => value === "" || isValid(value))
    .nullable()
    .optional()
    .transform((value): string | null => (value ? value : null));
}

const generalSettingsSchema = z
  .object({
    company: z
      .object({
        legalName: text,
        tradeName: text,
        primaryEmail: text,
        phone: text,
        website: text,
        address: text,
        rfc: text,
        logoUrl: logo,
        instagramUrl: optionalLink(isHttpsUrl),
        contactEmail: optionalLink(isContactEmail),
      })
      .strict(),
    regional: z
      .object({
        language: z.literal("es-MX"),
        timeZone: z.literal("America/Mexico_City"),
        dateFormat: z.enum(["d MMM yyyy", "dd/MM/yyyy"]),
        weekStartsOn: z.enum(["monday", "sunday"]),
      })
      .strict(),
    appearance: z.object({ systemLogoUrl: logo }).strict(),
    system: z.object({ systemName: text, version: text, showVersionInInterface: z.boolean() }).strict(),
  })
  .strict();

/** The settings when the candidate is a complete, valid value; null otherwise. */
export function parseGeneralSettingsInput(candidate: unknown): GeneralSettings | null {
  const result = generalSettingsSchema.safeParse(candidate);
  return result.success ? result.data : null;
}
