// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import {
  buildDefaultGeneralSettings,
  formatGeneralSettingsSavedAt,
  GENERAL_SETTINGS_STORAGE_KEY,
  loadGeneralSettings,
  restoreDefaultGeneralSettings,
  saveGeneralSettings,
} from "./general-settings";

describe("general settings save time", () => {
  afterEach(() => window.localStorage.clear());

  it("stamps a save with its time and reads it back", () => {
    const now = new Date("2026-11-04T16:30:00.000Z");
    const savedAt = saveGeneralSettings(buildDefaultGeneralSettings(), now);

    expect(savedAt).toBe(now.toISOString());
    const loaded = loadGeneralSettings();
    expect(loaded.hasCustom).toBe(true);
    expect(loaded.savedAt).toBe(now.toISOString());
  });

  it("has no save time before the first save or after restoring defaults", () => {
    expect(loadGeneralSettings().savedAt).toBeNull();

    saveGeneralSettings(buildDefaultGeneralSettings());
    restoreDefaultGeneralSettings();
    expect(loadGeneralSettings().savedAt).toBeNull();
  });

  it("keeps older payloads without a save time readable", () => {
    window.localStorage.setItem(
      GENERAL_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, data: buildDefaultGeneralSettings() }),
    );

    const loaded = loadGeneralSettings();
    expect(loaded.hasCustom).toBe(true);
    expect(loaded.savedAt).toBeNull();
  });

  it("ignores a save time that isn't a date", () => {
    window.localStorage.setItem(
      GENERAL_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, data: buildDefaultGeneralSettings(), savedAt: "ayer" }),
    );

    expect(loadGeneralSettings().savedAt).toBeNull();
  });

  it("formats the label as Guardado plus the date in Mexico City time", () => {
    const label = formatGeneralSettingsSavedAt("2026-11-04T16:30:00.000Z");
    expect(label.startsWith("Guardado ")).toBe(true);
    expect(label).toContain("2026");
    expect(label).toContain("10:30");
  });
});
