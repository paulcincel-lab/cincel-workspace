import { describe, expect, it } from "vitest";

import { todayTomorrowRange } from "./today-tomorrow";

describe("todayTomorrowRange", () => {
  it("covers local today and tomorrow in the organization time zone", () => {
    // 23:30 on Nov 6 in Mexico City (UTC−6).
    expect(todayTomorrowRange(new Date("2026-11-07T05:30:00Z"))).toEqual({
      from: "2026-11-06T06:00:00.000Z",
      to: "2026-11-08T05:59:59.999Z",
    });
  });

  it("starts at local midnight right after it passes", () => {
    expect(todayTomorrowRange(new Date("2026-11-07T06:00:00Z"))).toEqual({
      from: "2026-11-07T06:00:00.000Z",
      to: "2026-11-09T05:59:59.999Z",
    });
  });

  it("crosses month ends", () => {
    expect(todayTomorrowRange(new Date("2026-12-31T18:00:00Z"))).toEqual({
      from: "2026-12-31T06:00:00.000Z",
      to: "2027-01-02T05:59:59.999Z",
    });
  });

  it("handles a zone with daylight saving time", () => {
    // Mar 8 2026 is the US spring-forward day; New York is UTC−5 before it and UTC−4 after.
    expect(todayTomorrowRange(new Date("2026-03-08T12:00:00Z"), "America/New_York")).toEqual({
      from: "2026-03-08T05:00:00.000Z",
      to: "2026-03-10T03:59:59.999Z",
    });
  });
});
