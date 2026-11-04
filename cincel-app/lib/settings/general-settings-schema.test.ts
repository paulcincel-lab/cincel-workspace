import { describe, expect, it } from "vitest";

import { buildDefaultGeneralSettings, GENERAL_SETTINGS_LOGO_MAX_BYTES } from "./general-settings";
import { isValidLogoValue, parseGeneralSettingsInput } from "./general-settings-schema";

function pngDataUrl(bytes: number): string {
  return `data:image/png;base64,${Buffer.alloc(bytes, 1).toString("base64")}`;
}

describe("parseGeneralSettingsInput", () => {
  it("accepts the defaults", () => {
    expect(parseGeneralSettingsInput(buildDefaultGeneralSettings())).toEqual(buildDefaultGeneralSettings());
  });

  it("rejects missing sections, wrong types, unknown keys and overlong text", () => {
    const missing: Record<string, unknown> = { ...buildDefaultGeneralSettings() };
    delete missing.system;
    expect(parseGeneralSettingsInput(missing)).toBeNull();

    const wrongType = buildDefaultGeneralSettings() as unknown as { system: { showVersionInInterface: unknown } };
    wrongType.system.showVersionInInterface = "yes";
    expect(parseGeneralSettingsInput(wrongType)).toBeNull();

    expect(parseGeneralSettingsInput({ ...buildDefaultGeneralSettings(), extra: 1 })).toBeNull();

    const long = buildDefaultGeneralSettings();
    long.company.address = "x".repeat(301);
    expect(parseGeneralSettingsInput(long)).toBeNull();

    const regional = buildDefaultGeneralSettings() as unknown as { regional: { timeZone: string } };
    regional.regional.timeZone = "Europe/Madrid";
    expect(parseGeneralSettingsInput(regional)).toBeNull();

    expect(parseGeneralSettingsInput(null)).toBeNull();
  });

  it("rejects an invalid logo", () => {
    const settings = buildDefaultGeneralSettings();
    settings.appearance.systemLogoUrl = "javascript:alert(1)";
    expect(parseGeneralSettingsInput(settings)).toBeNull();
  });
});

describe("isValidLogoValue", () => {
  it("accepts empty, a same-site path and PNG/JPG data URLs within the limit", () => {
    expect(isValidLogoValue("")).toBe(true);
    expect(isValidLogoValue("/favicon.ico")).toBe(true);
    expect(isValidLogoValue(pngDataUrl(GENERAL_SETTINGS_LOGO_MAX_BYTES))).toBe(true);
    expect(isValidLogoValue(`data:image/jpeg;base64,${Buffer.from("jpg").toString("base64")}`)).toBe(true);
  });

  it("rejects other schemes, other image types, protocol-relative URLs and oversized images", () => {
    expect(isValidLogoValue("https://example.com/logo.png")).toBe(false);
    expect(isValidLogoValue("//example.com/logo.png")).toBe(false);
    expect(isValidLogoValue("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isValidLogoValue("data:image/png;base64,not base64!")).toBe(false);
    expect(isValidLogoValue(pngDataUrl(GENERAL_SETTINGS_LOGO_MAX_BYTES + 1))).toBe(false);
  });
});
