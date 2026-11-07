/**
 * Control de horario settings (redesign BE §3.12, §7.7, §16): every `INVALID`
 * rule of `saveTimeTrackingSettingsAction`, normalization, and the versioned
 * `{ version: 1, data }` value.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIME_TRACKING_SETTINGS,
  parseStoredTimeTrackingSettings,
  serializeTimeTrackingSettings,
  validateTimeTrackingSettings,
} from "@/lib/time-tracking/settings";
import type { TimeTrackingSettings } from "@/lib/types/redesign";

/** Saturday 2026-11-07 at noon in America/Mexico_City. */
const NOW = new Date("2026-11-07T12:00:00-06:00");

function valid(patch: Partial<TimeTrackingSettings> = {}): TimeTrackingSettings {
  return { ...DEFAULT_TIME_TRACKING_SETTINGS, workDays: [1, 2, 3, 4, 5], exemptRoles: [], ...patch };
}

function check(patch: Partial<TimeTrackingSettings>, previous: TimeTrackingSettings = valid()) {
  return () => validateTimeTrackingSettings(valid(patch), previous, NOW);
}

describe("validateTimeTrackingSettings", () => {
  it("accepts the defaults", () => {
    expect(validateTimeTrackingSettings(valid(), valid(), NOW)).toEqual(valid());
  });

  it("rejects dayEnd ≤ dayStart", () => {
    expect(check({ dayStart: "09:00", dayEnd: "09:00" })).toThrow(/^INVALID: dayEnd/);
    expect(check({ dayStart: "18:00", dayEnd: "09:00" })).toThrow(/^INVALID: dayEnd/);
  });

  it("rejects hoursPerDay outside 1–12", () => {
    expect(check({ hoursPerDay: 0 })).toThrow(/^INVALID: hoursPerDay/);
    expect(check({ hoursPerDay: 0.5 })).toThrow(/^INVALID: hoursPerDay/);
    expect(check({ hoursPerDay: 13 })).toThrow(/^INVALID: hoursPerDay/);
    expect(check({ hoursPerDay: 1 })).not.toThrow();
    expect(check({ hoursPerDay: 12 })).not.toThrow();
  });

  it("rejects empty workDays or days outside 0–6", () => {
    expect(check({ workDays: [] })).toThrow(/^INVALID: workDays/);
    expect(check({ workDays: [1, 7] })).toThrow(/^INVALID: workDays/);
    expect(check({ workDays: [-1] })).toThrow(/^INVALID: workDays/);
    expect(check({ workDays: [0, 6] })).not.toThrow();
  });

  it("rejects an exempt role that isn't an official role", () => {
    expect(check({ exemptRoles: ["Cliente"] })).toThrow(/^INVALID: exemptRoles/);
    expect(check({ exemptRoles: ["Dirección", "Pasante / Servicio Social"] })).not.toThrow();
  });

  it("rejects a changed requiredFrom earlier than tomorrow", () => {
    expect(check({ requiredFrom: "2026-11-07" })).toThrow(/^INVALID: requiredFrom/);
    expect(check({ requiredFrom: "2026-10-01" })).toThrow(/^INVALID: requiredFrom/);
    expect(check({ requiredFrom: "2026-11-08" })).not.toThrow();
  });

  it("keeps an unchanged requiredFrom even when it is already in the past", () => {
    const previous = valid({ requiredFrom: "2026-10-01" });
    expect(check({ requiredFrom: "2026-10-01" }, previous)).not.toThrow();
    expect(check({ requiredFrom: "2026-10-02" }, previous)).toThrow(/^INVALID: requiredFrom/);
    expect(check({ requiredFrom: null }, previous)).not.toThrow();
  });

  it("rejects unknown fields and malformed times", () => {
    const extra = { ...valid(), location: true } as unknown;
    expect(() => validateTimeTrackingSettings(extra, valid(), NOW)).toThrow(/^INVALID/);
    expect(check({ dayStart: "9:00" })).toThrow(/^INVALID: dayStart/);
    expect(check({ autoCloseAt: "25:00" })).toThrow(/^INVALID: autoCloseAt/);
  });

  it("de-duplicates and sorts work days and exempt roles", () => {
    const result = validateTimeTrackingSettings(
      valid({ workDays: [5, 1, 3, 1], exemptRoles: ["Dirección", "Dirección"] }),
      valid(),
      NOW,
    );
    expect(result.workDays).toEqual([1, 3, 5]);
    expect(result.exemptRoles).toEqual(["Dirección"]);
  });
});

describe("stored value", () => {
  it("round-trips through { version: 1, data }", () => {
    const settings = valid({ enabled: true, requiredFrom: "2026-12-01" });
    const raw = serializeTimeTrackingSettings(settings);
    expect(JSON.parse(raw)).toEqual({ version: 1, data: settings });
    expect(parseStoredTimeTrackingSettings(raw)).toEqual(settings);
  });

  it("returns null for a missing, unversioned or broken value", () => {
    expect(parseStoredTimeTrackingSettings(null)).toBeNull();
    expect(parseStoredTimeTrackingSettings("not json")).toBeNull();
    expect(parseStoredTimeTrackingSettings(JSON.stringify(valid()))).toBeNull();
    expect(parseStoredTimeTrackingSettings(JSON.stringify({ version: 2, data: valid() }))).toBeNull();
  });
});
