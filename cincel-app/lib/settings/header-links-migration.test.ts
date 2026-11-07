// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { buildDefaultGeneralSettings } from "@/lib/settings/general-settings";
import {
  applyLegacyHeaderLinks,
  CONTACT_EMAIL_ERROR,
  HEADER_LINKS_MIGRATED_STORAGE_KEY,
  headerLinkErrors,
  HTTPS_URL_ERROR,
  LEGACY_HEADER_LINKS_STORAGE_KEY,
  markLegacyHeaderLinksMigrated,
  parseLegacyHeaderLinks,
  readLegacyHeaderLinksOnce,
} from "@/lib/settings/header-links-migration";

afterEach(() => window.localStorage.clear());

describe("parseLegacyHeaderLinks", () => {
  it("keeps https links and a real address, dropping the Gmail inbox URL the legacy Correo button held", () => {
    const raw = JSON.stringify({
      instagram: " https://www.instagram.com/cincel.mx/ ",
      website: "https://www.cincel.mx/",
      email: "https://mail.google.com",
    });
    expect(parseLegacyHeaderLinks(raw)).toEqual({
      instagramUrl: "https://www.instagram.com/cincel.mx/",
      website: "https://www.cincel.mx/",
      contactEmail: null,
    });
  });

  it("accepts a mailto: address as the contact email", () => {
    expect(parseLegacyHeaderLinks(JSON.stringify({ email: "mailto:hola@cincel.mx" }))).toEqual({
      instagramUrl: null,
      website: null,
      contactEmail: "hola@cincel.mx",
    });
  });

  it("returns null for missing, broken or unusable values", () => {
    expect(parseLegacyHeaderLinks(null)).toBeNull();
    expect(parseLegacyHeaderLinks("{not json")).toBeNull();
    expect(parseLegacyHeaderLinks(JSON.stringify({ instagram: "http://insecure.mx", website: "cincel.mx" }))).toBeNull();
  });
});

describe("readLegacyHeaderLinksOnce", () => {
  it("reads the legacy key until the pickup is marked, then ignores it", () => {
    window.localStorage.setItem(
      LEGACY_HEADER_LINKS_STORAGE_KEY,
      JSON.stringify({ instagram: "https://instagram.com/cincel" }),
    );
    expect(readLegacyHeaderLinksOnce()?.instagramUrl).toBe("https://instagram.com/cincel");

    markLegacyHeaderLinksMigrated();
    expect(window.localStorage.getItem(HEADER_LINKS_MIGRATED_STORAGE_KEY)).toBeTruthy();
    expect(readLegacyHeaderLinksOnce()).toBeNull();
    // The legacy header still reads its key while the flag is off.
    expect(window.localStorage.getItem(LEGACY_HEADER_LINKS_STORAGE_KEY)).not.toBeNull();
  });
});

describe("applyLegacyHeaderLinks", () => {
  const legacy = {
    instagramUrl: "https://instagram.com/cincel",
    website: "https://www.cincel.mx/",
    contactEmail: "hola@cincel.mx",
  };

  it("fills empty fields and the still-default website", () => {
    const { settings, applied } = applyLegacyHeaderLinks(buildDefaultGeneralSettings(), legacy, { hasCustom: false });
    expect(applied).toBe(true);
    expect(settings.company).toMatchObject(legacy);
  });

  it("never overwrites a value the server already holds", () => {
    const stored = buildDefaultGeneralSettings();
    stored.company.instagramUrl = "https://instagram.com/otro";
    stored.company.contactEmail = "admin@cincel.mx";
    stored.company.website = "https://cincel.mx";
    const { settings, applied } = applyLegacyHeaderLinks(stored, legacy, { hasCustom: true });
    expect(applied).toBe(false);
    expect(settings).toBe(stored);
  });
});

describe("headerLinkErrors", () => {
  it("accepts empty fields and well-formed values", () => {
    const company = buildDefaultGeneralSettings().company;
    expect(headerLinkErrors({ ...company, website: "", instagramUrl: null, contactEmail: null })).toEqual({});
    expect(
      headerLinkErrors({ ...company, instagramUrl: "https://instagram.com/cincel", contactEmail: "hola@cincel.mx" }),
    ).toEqual({});
  });

  it("flags non-https URLs and malformed addresses", () => {
    const company = buildDefaultGeneralSettings().company;
    expect(
      headerLinkErrors({ ...company, website: "www.cincel.mx", instagramUrl: "http://instagram.com/x", contactEmail: "hola@" }),
    ).toEqual({ website: HTTPS_URL_ERROR, instagramUrl: HTTPS_URL_ERROR, contactEmail: CONTACT_EMAIL_ERROR });
  });
});
