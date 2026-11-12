// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseWorkdayHours, WorkdayHoursSchema } from "./workday-setting";

describe("workday setting", () => {
  it("reads the stored number, else 6", () => {
    expect(parseWorkdayHours("7.5")).toBe(7.5);
    expect(parseWorkdayHours(null)).toBe(6);
    expect(parseWorkdayHours("abc")).toBe(6);
    expect(parseWorkdayHours("13")).toBe(6);
  });

  it("accepts 1-12 in steps of 0.5", () => {
    expect(WorkdayHoursSchema.safeParse(1).success).toBe(true);
    expect(WorkdayHoursSchema.safeParse(12).success).toBe(true);
    expect(WorkdayHoursSchema.safeParse(0.5).success).toBe(false);
    expect(WorkdayHoursSchema.safeParse(6.25).success).toBe(false);
  });
});
