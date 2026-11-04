// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import {
  buildDefaultGeneralSettings,
  clearLegacyGeneralSettings,
  formatGeneralSettingsSavedAt,
  GENERAL_SETTINGS_STORAGE_KEY,
  readLegacyGeneralSettings,
} from "./general-settings";

describe("legacy general settings pickup", () => {
  afterEach(() => window.localStorage.clear());

  it("is null when this browser never saved settings", () => {
    expect(readLegacyGeneralSettings()).toBeNull();
  });

  it("reads a value saved before the settings moved to the server", () => {
    const data = buildDefaultGeneralSettings();
    data.company.tradeName = "Cincel Studio";
    window.localStorage.setItem(
      GENERAL_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, data, savedAt: "2026-11-04T16:30:00.000Z" }),
    );

    expect(readLegacyGeneralSettings()?.company.tradeName).toBe("Cincel Studio");
  });

  it("ignores unreadable or unknown payloads", () => {
    window.localStorage.setItem(GENERAL_SETTINGS_STORAGE_KEY, "{no json");
    expect(readLegacyGeneralSettings()).toBeNull();

    window.localStorage.setItem(GENERAL_SETTINGS_STORAGE_KEY, JSON.stringify({ version: 2, data: {} }));
    expect(readLegacyGeneralSettings()).toBeNull();
  });

  it("clears the old value", () => {
    window.localStorage.setItem(
      GENERAL_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, data: buildDefaultGeneralSettings() }),
    );
    clearLegacyGeneralSettings();
    expect(window.localStorage.getItem(GENERAL_SETTINGS_STORAGE_KEY)).toBeNull();
  });
});

describe("general settings save label", () => {
  it("formats the label as Guardado plus the date in Mexico City time", () => {
    const label = formatGeneralSettingsSavedAt("2026-11-04T16:30:00.000Z");
    expect(label.startsWith("Guardado ")).toBe(true);
    expect(label).toContain("2026");
    expect(label).toContain("10:30");
  });
});
