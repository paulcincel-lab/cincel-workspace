import { describe, expect, it } from "vitest";

import {
  addDaysToDate,
  eachDate,
  findFreeSlots,
  localDateOf,
  localTimeOf,
  weekdayOf,
  zonedTimeToUtc,
} from "@/lib/assistant/agenda/free-slots";

const TZ = "America/Mexico_City";
const SETTINGS = { dayStart: "09:00", dayEnd: "18:00", workDays: [1, 2, 3, 4, 5] };
const A = "staff-a";
const B = "staff-b";

function base(overrides: Partial<Parameters<typeof findFreeSlots>[0]> = {}) {
  return findFreeSlots({
    from: "2030-01-07",
    to: "2030-01-07",
    durationMin: 30,
    workingHoursOnly: true,
    settings: SETTINGS,
    timeZone: TZ,
    staffIds: [A, B],
    absences: [],
    busy: [],
    ...overrides,
  });
}

describe("date helpers", () => {
  it("converts local org time to UTC and back", () => {
    const instant = zonedTimeToUtc("2030-01-07", 9 * 60, TZ);
    expect(instant.toISOString()).toBe("2030-01-07T15:00:00.000Z");
    expect(localDateOf(instant, TZ)).toBe("2030-01-07");
    expect(localTimeOf(instant, TZ)).toBe("09:00");
  });

  it("walks dates and weekdays", () => {
    expect(addDaysToDate("2030-01-31", 1)).toBe("2030-02-01");
    expect(weekdayOf("2030-01-07")).toBe(1);
    expect(eachDate("2030-01-06", "2030-01-08")).toEqual(["2030-01-06", "2030-01-07", "2030-01-08"]);
    expect(() => eachDate("2030-01-08", "2030-01-06")).toThrow("INVALID");
    expect(() => eachDate("2030-01-01", "2030-03-01")).toThrow("INVALID");
  });
});

describe("findFreeSlots", () => {
  it("returns the whole jornada of a free work day", () => {
    const result = base();
    expect(result.slots).toEqual([
      { date: "2030-01-07", start: "2030-01-07T15:00:00.000Z", end: "2030-01-08T00:00:00.000Z", minutes: 540 },
    ]);
  });

  it("subtracts busy intervals and drops windows shorter than the duration", () => {
    const result = base({
      durationMin: 60,
      busy: [
        { start: "2030-01-07T09:30:00-06:00", end: "2030-01-07T12:00:00-06:00" },
        { start: "2030-01-07T12:30:00-06:00", end: "2030-01-07T17:00:00-06:00" },
      ],
    });
    // 09:00–09:30 and 12:00–12:30 are too short; 17:00–18:00 fits.
    expect(result.slots.map((s) => [localTimeOf(new Date(s.start), TZ), localTimeOf(new Date(s.end), TZ)])).toEqual([
      ["17:00", "18:00"],
    ]);
  });

  it("skips weekends inside working hours and a day anyone is absent", () => {
    const result = base({
      from: "2030-01-05",
      to: "2030-01-08",
      absences: [{ staffId: B, from: "2030-01-07", to: "2030-01-07" }],
    });
    expect(result.slots.map((s) => s.date)).toEqual(["2030-01-08"]);
    expect(result.absentDays).toEqual([{ date: "2030-01-07", staffIds: [B] }]);
  });

  it("ignores absences of people outside the search", () => {
    const result = base({ absences: [{ staffId: "someone-else", from: "2030-01-07", to: "2030-01-07" }] });
    expect(result.slots).toHaveLength(1);
    expect(result.absentDays).toEqual([]);
  });

  it("uses the whole day, every day, outside working hours", () => {
    const result = base({ from: "2030-01-05", to: "2030-01-05", workingHoursOnly: false });
    expect(result.slots).toEqual([
      { date: "2030-01-05", start: "2030-01-05T06:00:00.000Z", end: "2030-01-06T06:00:00.000Z", minutes: 1440 },
    ]);
  });

  it("never proposes time in the past", () => {
    const result = base({ now: new Date("2030-01-07T22:00:00.000Z") });
    expect(result.slots).toEqual([
      { date: "2030-01-07", start: "2030-01-07T22:00:00.000Z", end: "2030-01-08T00:00:00.000Z", minutes: 120 },
    ]);
  });

  it("caps the number of windows", () => {
    const result = base({ from: "2030-01-07", to: "2030-01-11", limit: 2 });
    expect(result.slots).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it("rejects a zero duration or an inverted jornada", () => {
    expect(() => base({ durationMin: 0 })).toThrow("INVALID");
    expect(() => base({ settings: { ...SETTINGS, dayStart: "18:00", dayEnd: "09:00" } })).toThrow("INVALID");
  });
});
