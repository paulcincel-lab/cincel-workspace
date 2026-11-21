import { describe, expect, it } from "vitest";

import { mexicoMonthRange } from "./month-range";

describe("mexicoMonthRange", () => {
  it("spans the calendar month in Mexico City time (UTC-6)", () => {
    const { start, end } = mexicoMonthRange(new Date("2026-11-21T15:00:00Z"));
    expect(start.toISOString()).toBe("2026-11-01T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-01T06:00:00.000Z");
  });

  it("still counts the last evening of the month in Mexico as that month", () => {
    // 2026-12-01 03:00Z is Nov 30, 21:00 in Mexico City.
    const { start, end } = mexicoMonthRange(new Date("2026-12-01T03:00:00Z"));
    expect(start.toISOString()).toBe("2026-11-01T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-01T06:00:00.000Z");
  });

  it("starts the new month at local midnight", () => {
    const { start } = mexicoMonthRange(new Date("2026-12-01T06:00:00Z"));
    expect(start.toISOString()).toBe("2026-12-01T06:00:00.000Z");
  });

  it("rolls over the year", () => {
    const { start, end } = mexicoMonthRange(new Date("2026-12-15T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-12-01T06:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T06:00:00.000Z");
  });

  it("handles a month that starts on a UTC day earlier", () => {
    // 2026-03-01 02:00Z is Feb 28, 20:00 in Mexico City.
    const { start, end } = mexicoMonthRange(new Date("2026-03-01T02:00:00Z"));
    expect(start.toISOString()).toBe("2026-02-01T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-01T06:00:00.000Z");
  });
});
