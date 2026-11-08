import "server-only";

import { cache } from "react";

import { getAppSettingEntry } from "@/lib/repositories/app-settings-repository";
import {
  buildDefaultLoadedGeneralSettings,
  GENERAL_SETTINGS_SETTING_KEY,
  type LoadedGeneralSettings,
  sanitizeGeneralSettings,
} from "@/lib/settings/general-settings";

/**
 * The stored general settings with their save time, or the defaults (also
 * when the DB can't be read). Per-request cache: the root layout and the
 * pages share one read.
 */
export const getGeneralSettings = cache(async function getGeneralSettings(): Promise<LoadedGeneralSettings> {
  try {
    const entry = await getAppSettingEntry(GENERAL_SETTINGS_SETTING_KEY);
    if (!entry) return buildDefaultLoadedGeneralSettings();
    return {
      settings: sanitizeGeneralSettings(JSON.parse(entry.value)),
      hasCustom: true,
      savedAt: entry.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error("[settings] could not read the general settings", error);
    return buildDefaultLoadedGeneralSettings();
  }
});
