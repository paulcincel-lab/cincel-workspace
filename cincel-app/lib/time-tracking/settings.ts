/**
 * Control de horario settings (redesign BE §3.12, §7.7): `app_settings('time_tracking')`,
 * versioned `{ version: 1, data }` like `general_settings`.
 *
 * The defaults, the parser and the validation are pure and client-safe; the
 * read and the write load the repository lazily so a client component can
 * import `DEFAULT_TIME_TRACKING_SETTINGS` without pulling in the database.
 */
import { cache } from "react";

import { OFFICIAL_CINCEL_ROLES } from "@/lib/data/roles";
import { addDays, localDate } from "@/lib/time-tracking/local-time";
import type { TimeTrackingSettings } from "@/lib/types/redesign";
import { TimeTrackingSettingsSchema, versionedSetting } from "@/lib/validation/redesign";

export { TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/local-time";

export const TIME_TRACKING_SETTING_KEY = "time_tracking";

/** The seeded value (BE §4); also the fallback when the row is missing or unreadable. */
export const DEFAULT_TIME_TRACKING_SETTINGS: TimeTrackingSettings = {
  enabled: false,
  requiredFrom: null,
  dayStart: "09:00",
  dayEnd: "18:00",
  hoursPerDay: 8,
  lateToleranceMin: 15,
  workDays: [1, 2, 3, 4, 5],
  promptAtLogin: true,
  autoCloseAt: "20:00",
  lunchMinutes: 60,
  exemptRoles: [],
};

const StoredTimeTrackingSettingsSchema = versionedSetting(TimeTrackingSettingsSchema);

function defaults(): TimeTrackingSettings {
  return { ...DEFAULT_TIME_TRACKING_SETTINGS, workDays: [...DEFAULT_TIME_TRACKING_SETTINGS.workDays], exemptRoles: [] };
}

/** The stored settings, or null when the value is missing or does not parse. */
export function parseStoredTimeTrackingSettings(raw: string | null): TimeTrackingSettings | null {
  if (raw === null) return null;
  try {
    const result = StoredTimeTrackingSettingsSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data.data : null;
  } catch {
    return null;
  }
}

export function serializeTimeTrackingSettings(settings: TimeTrackingSettings): string {
  return JSON.stringify({ version: 1, data: settings });
}

function invalid(field: string): never {
  throw new Error(`INVALID: ${field}`);
}

/**
 * Validates a settings save (BE §7.7) against the stored `previous` value and
 * returns the normalized settings (work days and exempt roles de-duplicated,
 * work days sorted). Throws `INVALID: <field>` when dayEnd ≤ dayStart,
 * hoursPerDay ∉ 1–12, workDays is empty or ∉ 0–6, an exempt role is not an
 * official role, or a **changed** `requiredFrom` is earlier than tomorrow
 * (trial days never become payroll days retroactively).
 */
export function validateTimeTrackingSettings(
  input: unknown,
  previous: TimeTrackingSettings,
  now: Date,
): TimeTrackingSettings {
  const result = TimeTrackingSettingsSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    invalid(issue ? issue.path.map(String).join(".") : "");
  }
  const parsed = result.data;
  if (parsed.dayEnd <= parsed.dayStart) invalid("dayEnd");

  const workDays = [...new Set(parsed.workDays)].sort((a, b) => a - b);
  if (workDays.length === 0 || workDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    invalid("workDays");
  }

  const official = OFFICIAL_CINCEL_ROLES as readonly string[];
  const exemptRoles = [...new Set(parsed.exemptRoles)];
  if (exemptRoles.some((role) => !official.includes(role))) invalid("exemptRoles");

  if (parsed.requiredFrom !== null && parsed.requiredFrom !== previous.requiredFrom) {
    const tomorrow = addDays(localDate(now), 1);
    if (parsed.requiredFrom < tomorrow) invalid("requiredFrom");
  }

  return { ...parsed, workDays, exemptRoles };
}

/** The stored settings, or the defaults (also when the row can't be read). Per-request cache. */
export const getTimeTrackingSettings = cache(async function getTimeTrackingSettings(): Promise<TimeTrackingSettings> {
  try {
    const { getAppSetting } = await import("@/lib/repositories/app-settings-repository");
    return parseStoredTimeTrackingSettings(await getAppSetting(TIME_TRACKING_SETTING_KEY)) ?? defaults();
  } catch (error) {
    console.error("[time-tracking] could not read the settings", error);
    return defaults();
  }
});

/** Stores the full settings (no partial merge). */
export async function writeTimeTrackingSettings(settings: TimeTrackingSettings): Promise<void> {
  const { setAppSetting } = await import("@/lib/repositories/app-settings-repository");
  await setAppSetting(TIME_TRACKING_SETTING_KEY, serializeTimeTrackingSettings(settings));
}
