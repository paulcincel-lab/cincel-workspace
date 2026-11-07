import { describe, expect, it } from "vitest";

import {
  buildDefaultGeneralSettings,
  GENERAL_SETTINGS_DEFAULTS,
  isContactEmail,
  isHttpsUrl,
  sanitizeGeneralSettings,
} from "@/lib/settings/general-settings";
import { parseGeneralSettingsInput } from "@/lib/settings/general-settings-schema";

/** A payload exactly as saved before the company link fields existed. */
function oldPayload() {
  return {
    company: {
      legalName: "Cincel Arquitectura y Construccion S.A. de C.V.",
      tradeName: "Cincel",
      primaryEmail: "hola@cincel.mx",
      phone: "+52 33 1111 2222",
      website: "https://cincel.mx",
      address: "Zapopan, Jalisco",
      rfc: "CAC010101AAA",
      logoUrl: "/favicon.ico",
    },
    regional: {
      language: "es-MX",
      timeZone: "America/Mexico_City",
      dateFormat: "dd/MM/yyyy",
      weekStartsOn: "monday",
    },
    appearance: { systemLogoUrl: "/favicon.ico" },
    system: { systemName: "Cincel Workspace", version: "v0.1.0-beta", showVersionInInterface: false },
  };
}

function newPayload(company: { instagramUrl?: unknown; contactEmail?: unknown }) {
  const payload = oldPayload();
  return { ...payload, company: { ...payload.company, ...company } };
}

describe("general settings company link defaults", () => {
  it("default to null so no link shows until one is saved", () => {
    expect(GENERAL_SETTINGS_DEFAULTS.company.instagramUrl).toBeNull();
    expect(GENERAL_SETTINGS_DEFAULTS.company.contactEmail).toBeNull();
    expect(parseGeneralSettingsInput(buildDefaultGeneralSettings())).toEqual(buildDefaultGeneralSettings());
  });
});

describe("parseGeneralSettingsInput with an old payload", () => {
  it("parses settings saved before the link fields, keeping every saved value", () => {
    const parsed = parseGeneralSettingsInput(oldPayload());
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual({
      ...oldPayload(),
      company: { ...oldPayload().company, instagramUrl: null, contactEmail: null },
    });
  });

  it("still rejects unknown keys in an old payload", () => {
    const payload = oldPayload() as unknown as { company: Record<string, unknown> };
    payload.company.twitterUrl = "https://x.com/cincel";
    expect(parseGeneralSettingsInput(payload)).toBeNull();
  });
});

describe("parseGeneralSettingsInput with a new payload", () => {
  it("accepts an https Instagram URL and a contact email", () => {
    const parsed = parseGeneralSettingsInput(
      newPayload({ instagramUrl: "https://www.instagram.com/cincel.mx", contactEmail: "admin@cincel.mx" }),
    );
    expect(parsed?.company.instagramUrl).toBe("https://www.instagram.com/cincel.mx");
    expect(parsed?.company.contactEmail).toBe("admin@cincel.mx");
    expect(parsed?.company.legalName).toBe(oldPayload().company.legalName);
  });

  it("turns null and blank values into null and trims surrounding spaces", () => {
    expect(parseGeneralSettingsInput(newPayload({ instagramUrl: null, contactEmail: null }))?.company).toMatchObject({
      instagramUrl: null,
      contactEmail: null,
    });
    expect(parseGeneralSettingsInput(newPayload({ instagramUrl: "  ", contactEmail: "" }))?.company).toMatchObject({
      instagramUrl: null,
      contactEmail: null,
    });
    expect(
      parseGeneralSettingsInput(newPayload({ instagramUrl: " https://instagram.com/cincel ", contactEmail: " a@b.mx " }))
        ?.company,
    ).toMatchObject({ instagramUrl: "https://instagram.com/cincel", contactEmail: "a@b.mx" });
  });

  it("rejects a non-https or malformed Instagram URL", () => {
    expect(parseGeneralSettingsInput(newPayload({ instagramUrl: "http://instagram.com/cincel" }))).toBeNull();
    expect(parseGeneralSettingsInput(newPayload({ instagramUrl: "javascript:alert(1)" }))).toBeNull();
    expect(parseGeneralSettingsInput(newPayload({ instagramUrl: "instagram.com/cincel" }))).toBeNull();
    expect(parseGeneralSettingsInput(newPayload({ instagramUrl: `https://instagram.com/${"x".repeat(300)}` }))).toBeNull();
    expect(parseGeneralSettingsInput(newPayload({ instagramUrl: 42 }))).toBeNull();
  });

  it("rejects a malformed contact email", () => {
    expect(parseGeneralSettingsInput(newPayload({ contactEmail: "admin" }))).toBeNull();
    expect(parseGeneralSettingsInput(newPayload({ contactEmail: "admin@cincel" }))).toBeNull();
    expect(parseGeneralSettingsInput(newPayload({ contactEmail: "ad min@cincel.mx" }))).toBeNull();
    expect(parseGeneralSettingsInput(newPayload({ contactEmail: true }))).toBeNull();
  });
});

describe("sanitizeGeneralSettings with stored rows", () => {
  it("reads an old stored row without loss and fills the new fields with null", () => {
    const settings = sanitizeGeneralSettings({ version: 1, data: oldPayload() });
    expect(settings.company).toEqual({ ...oldPayload().company, instagramUrl: null, contactEmail: null });
    expect(settings.system.showVersionInInterface).toBe(false);
  });

  it("keeps valid stored links and drops malformed ones", () => {
    const valid = sanitizeGeneralSettings({
      version: 1,
      data: newPayload({ instagramUrl: "https://instagram.com/cincel", contactEmail: "admin@cincel.mx" }),
    });
    expect(valid.company.instagramUrl).toBe("https://instagram.com/cincel");
    expect(valid.company.contactEmail).toBe("admin@cincel.mx");

    const invalid = sanitizeGeneralSettings({
      version: 1,
      data: newPayload({ instagramUrl: "ftp://instagram.com", contactEmail: 7 }),
    });
    expect(invalid.company.instagramUrl).toBeNull();
    expect(invalid.company.contactEmail).toBeNull();
    expect(invalid.company.tradeName).toBe("Cincel");
  });
});

describe("link shape checks", () => {
  it("isHttpsUrl accepts only absolute https URLs with a dotted host", () => {
    expect(isHttpsUrl("https://instagram.com/cincel")).toBe(true);
    expect(isHttpsUrl("http://instagram.com/cincel")).toBe(false);
    expect(isHttpsUrl("https://localhost")).toBe(false);
    expect(isHttpsUrl("not a url")).toBe(false);
  });

  it("isContactEmail accepts a plain name@domain.tld", () => {
    expect(isContactEmail("admin@cincel.mx")).toBe(true);
    expect(isContactEmail("admin@cincel")).toBe(false);
    expect(isContactEmail("@cincel.mx")).toBe(false);
  });
});
