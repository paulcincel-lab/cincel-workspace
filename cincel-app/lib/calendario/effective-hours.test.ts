// @vitest-environment node
import { describe, expect, it } from "vitest";

import { effectiveHours } from "@/lib/calendario/load";
import { EstimatedHoursSchema } from "@/lib/validation/calendario";

describe("effectiveHours", () => {
  it("uses the task value first", () => {
    expect(effectiveHours({ estimatedHours: 3, templateHours: 2 })).toEqual({ hours: 3, source: "task" });
  });

  it("falls back to the template default", () => {
    expect(effectiveHours({ estimatedHours: null, templateHours: 2 })).toEqual({ hours: 2, source: "template" });
  });

  it("falls back to 1 h when neither is set", () => {
    expect(effectiveHours({ estimatedHours: null, templateHours: null })).toEqual({ hours: 1, source: "default" });
  });
});

describe("EstimatedHoursSchema", () => {
  it("accepts null and values in (0, 80]", () => {
    for (const ok of [null, 0.5, 8, 80]) expect(EstimatedHoursSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects values outside 0–80", () => {
    for (const bad of [0, -1, 80.5, 100]) expect(EstimatedHoursSchema.safeParse(bad).success).toBe(false);
  });
});
