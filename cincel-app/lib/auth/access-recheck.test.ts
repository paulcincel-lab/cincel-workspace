// @vitest-environment node
import { describe, expect, it } from "vitest";

import { accessRecheckHours, DEFAULT_ACCESS_RECHECK_HOURS, isAccessCheckDue } from "./access-recheck";

describe("accessRecheckHours", () => {
  it("defaults to 4 when unset or empty", () => {
    expect(accessRecheckHours({})).toBe(DEFAULT_ACCESS_RECHECK_HOURS);
    expect(accessRecheckHours({ ACCESS_RECHECK_HOURS: " " })).toBe(4);
  });

  it("reads a positive number of hours", () => {
    expect(accessRecheckHours({ ACCESS_RECHECK_HOURS: "2" })).toBe(2);
    expect(accessRecheckHours({ ACCESS_RECHECK_HOURS: " 0.5 " })).toBe(0.5);
  });

  it("ignores invalid values", () => {
    for (const value of ["0", "-3", "abc", "Infinity", "4h"]) {
      expect(accessRecheckHours({ ACCESS_RECHECK_HOURS: value })).toBe(4);
    }
  });
});

describe("isAccessCheckDue", () => {
  const now = new Date("2026-11-03T12:00:00Z");

  it("is due when never checked", () => {
    expect(isAccessCheckDue(null, 4, now)).toBe(true);
  });

  it("is due once the interval has passed", () => {
    expect(isAccessCheckDue(new Date("2026-11-03T08:00:00Z"), 4, now)).toBe(true);
    expect(isAccessCheckDue(new Date("2026-11-03T08:00:01Z"), 4, now)).toBe(false);
  });
});
