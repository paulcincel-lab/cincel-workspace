// @vitest-environment node
/**
 * Pure rules of the `auto-close-jornadas` job (redesign BE §8.7, §9.5, §13):
 * the local instant of a wall-clock time, when an open entry is auto-closed
 * (with and without `autoCloseAt`), how its pauses are closed, and the
 * missing clock-in window at `dayStart + 2 h`.
 */
import { describe, expect, it } from "vitest";

import {
  autoCloseDue,
  autoCloseInstant,
  closePausesAt,
  localInstant,
  missingClockInWindow,
} from "@/lib/time-tracking/auto-close";
import { DEFAULT_TIME_TRACKING_SETTINGS } from "@/lib/time-tracking/settings";
import type { TimeTrackingSettings } from "@/lib/types/redesign";

const settings: TimeTrackingSettings = {
  ...DEFAULT_TIME_TRACKING_SETTINGS,
  enabled: true,
  requiredFrom: "2026-11-02",
  dayStart: "09:00",
  dayEnd: "18:00",
  autoCloseAt: "20:00",
  workDays: [1, 2, 3, 4, 5],
};

// 2026-11-09 is a Monday; Mexico City is UTC−6 all year since 2022.
const MONDAY = "2026-11-09";

describe("localInstant", () => {
  it("turns a Mexico City wall-clock time into its UTC instant", () => {
    expect(localInstant(MONDAY, "20:00").toISOString()).toBe("2026-11-10T02:00:00.000Z");
    expect(localInstant(MONDAY, "00:00").toISOString()).toBe("2026-11-09T06:00:00.000Z");
  });

  it("follows the zone's historical offset (daylight time in July 2021)", () => {
    expect(localInstant("2021-07-05", "20:00").toISOString()).toBe("2021-07-06T01:00:00.000Z");
    expect(localInstant("2021-01-04", "20:00").toISOString()).toBe("2021-01-05T02:00:00.000Z");
  });
});

describe("autoCloseDue", () => {
  const startedAt = localInstant(MONDAY, "09:00");

  it("waits until autoCloseAt of the work date", () => {
    expect(autoCloseDue({ workDate: MONDAY, startedAt }, settings, localInstant(MONDAY, "19:59"))).toBeNull();
    expect(autoCloseDue({ workDate: MONDAY, startedAt }, settings, localInstant(MONDAY, "20:00"))).toEqual(
      localInstant(MONDAY, "20:00"),
    );
  });

  it("uses dayEnd when autoCloseAt is null", () => {
    const noAuto = { ...settings, autoCloseAt: null };
    expect(autoCloseInstant(MONDAY, noAuto)).toEqual(localInstant(MONDAY, "18:00"));
    expect(autoCloseDue({ workDate: MONDAY, startedAt }, noAuto, localInstant(MONDAY, "17:59"))).toBeNull();
    expect(autoCloseDue({ workDate: MONDAY, startedAt }, noAuto, localInstant(MONDAY, "18:30"))).toEqual(
      localInstant(MONDAY, "18:00"),
    );
  });

  it("closes an entry of an earlier day at that day's cutoff, never into the next day", () => {
    const nextMorning = localInstant("2026-11-10", "08:00");
    expect(autoCloseDue({ workDate: MONDAY, startedAt }, settings, nextMorning)).toEqual(
      localInstant(MONDAY, "20:00"),
    );
  });

  it("never closes before the entry started", () => {
    const late = localInstant(MONDAY, "21:00");
    expect(autoCloseDue({ workDate: MONDAY, startedAt: late }, settings, localInstant(MONDAY, "21:05"))).toEqual(late);
  });
});

describe("closePausesAt", () => {
  it("closes the open pause and keeps the closed ones", () => {
    const at = new Date("2026-11-10T02:00:00.000Z");
    const closed = { from: "2026-11-09T19:00:00.000Z", to: "2026-11-09T19:30:00.000Z" };
    expect(closePausesAt([closed, { from: "2026-11-10T01:00:00.000Z", to: null }], at)).toEqual([
      closed,
      { from: "2026-11-10T01:00:00.000Z", to: "2026-11-10T02:00:00.000Z" },
    ]);
  });

  it("clips a pause that started after the closing instant", () => {
    const at = new Date("2026-11-10T02:00:00.000Z");
    expect(closePausesAt([{ from: "2026-11-10T03:00:00.000Z", to: null }], at)).toEqual([
      { from: "2026-11-10T02:00:00.000Z", to: "2026-11-10T02:00:00.000Z" },
    ]);
  });
});

describe("missingClockInWindow", () => {
  it("opens at dayStart + 2 h on a required work day, one window key per day", () => {
    expect(missingClockInWindow(localInstant(MONDAY, "10:59"), settings).run).toBe(false);
    expect(missingClockInWindow(localInstant(MONDAY, "11:00"), settings)).toEqual({
      run: true,
      date: MONDAY,
      windowKey: `sin_entrada:${MONDAY}`,
    });
    expect(missingClockInWindow(localInstant(MONDAY, "15:00"), settings).windowKey).toBe(`sin_entrada:${MONDAY}`);
    expect(missingClockInWindow(localInstant(MONDAY, "18:00"), settings).run).toBe(false);
  });

  it("never runs before requiredFrom, without requiredFrom, disabled or on a non-work day", () => {
    const at = localInstant(MONDAY, "12:00");
    expect(missingClockInWindow(at, { ...settings, requiredFrom: "2026-11-10" }).run).toBe(false);
    expect(missingClockInWindow(at, { ...settings, requiredFrom: null }).run).toBe(false);
    expect(missingClockInWindow(at, { ...settings, enabled: false }).run).toBe(false);
    expect(missingClockInWindow(localInstant("2026-11-14", "12:00"), settings).run).toBe(false);
  });
});
