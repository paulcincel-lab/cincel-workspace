// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  addDaysToDateKey,
  formatReminderWhen,
  isPastReminderTime,
  remindersForTodayAndTomorrow,
  snoozeOneHourTarget,
  snoozeTomorrowTarget,
  toZonedInputs,
  zonedInputsToIso,
} from "./reminder-time";
import type { Reminder } from "@/lib/types/redesign";

// Fri 2026-11-06 14:14 in Mexico City (UTC−6).
const NOW = new Date("2026-11-06T20:14:00.000Z");

function r(id: string, dueAt: string, extra: Partial<Reminder> = {}): Reminder {
  return { id, text: id, dueAt, repeat: "none", channels: ["app"], taskId: null, projectId: null, firedAt: null, cancelledAt: null, ...extra };
}

describe("reminder-time", () => {
  it("converts the date + time inputs to and from ISO in the org time zone", () => {
    expect(zonedInputsToIso("2026-11-07", "09:00")).toBe("2026-11-07T15:00:00.000Z");
    expect(toZonedInputs("2026-11-07T15:00:00.000Z")).toEqual({ date: "2026-11-07", time: "09:00" });
    expect(zonedInputsToIso("2026-11-07", "")).toBeNull();
    expect(zonedInputsToIso("", "09:00")).toBeNull();
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("labels hoy, mañana and later days in lowercase es-MX", () => {
    expect(formatReminderWhen("2026-11-06T23:00:00.000Z", NOW)).toBe("hoy 17:00");
    expect(formatReminderWhen("2026-11-07T15:00:00.000Z", NOW)).toBe("mañana 9:00");
    const later = formatReminderWhen("2026-11-15T15:00:00.000Z", NOW);
    expect(later).toBe(later.toLowerCase());
    expect(later).toMatch(/15 nov 9:00$/);
  });

  it("keeps open reminders of today and tomorrow, by time", () => {
    const list = [
      r("b", "2026-11-07T15:00:00.000Z"),
      r("a", "2026-11-06T16:00:00.000Z"),
      r("late", "2026-11-08T15:00:00.000Z"),
      r("fired", "2026-11-06T21:00:00.000Z", { firedAt: "2026-11-06T21:00:00.000Z" }),
      r("off", "2026-11-06T22:00:00.000Z", { cancelledAt: "2026-11-06T10:00:00.000Z" }),
      // 23:30 local today is 05:30 UTC tomorrow.
      r("night", "2026-11-07T05:30:00.000Z"),
    ];
    expect(remindersForTodayAndTomorrow(list, NOW).map((x) => x.id)).toEqual(["a", "night", "b"]);
  });

  it("computes the snooze targets and the PAST_TIME rule", () => {
    expect(snoozeOneHourTarget("2026-11-06T23:00:00.000Z", NOW)).toBe("2026-11-07T00:00:00.000Z");
    expect(snoozeOneHourTarget("2026-11-06T16:00:00.000Z", NOW)).toBe("2026-11-06T21:14:00.000Z");
    expect(snoozeTomorrowTarget(NOW)).toBe("2026-11-07T15:00:00.000Z");
    expect(isPastReminderTime("2026-11-06T20:13:30.000Z", NOW)).toBe(false);
    expect(isPastReminderTime("2026-11-06T20:12:00.000Z", NOW)).toBe(true);
  });
});
