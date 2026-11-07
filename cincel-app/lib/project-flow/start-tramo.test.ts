import { describe, expect, it } from "vitest";

import { flowToday, managerFor, offsetDate } from "./start-tramo";

describe("start-tramo helpers", () => {
  it("offsets dates from the base and keeps null offsets null", () => {
    expect(offsetDate("2026-01-30", 3)).toBe("2026-02-02");
    expect(offsetDate("2026-01-30", 0)).toBe("2026-01-30");
    expect(offsetDate("2026-01-30", null)).toBeNull();
  });

  it("uses Mexico City for today", () => {
    // 03:00 UTC is still the previous day in America/Mexico_City (UTC-6).
    expect(flowToday(new Date("2026-03-10T03:00:00Z"))).toBe("2026-03-09");
  });

  it("picks the manager per assignment mode", () => {
    expect(managerFor({ mode: "self" }, "p1", "actor")).toBe("actor");
    expect(managerFor({ mode: "none" }, "p1", "actor")).toBeNull();
    expect(managerFor({ mode: "by_phase", managers: { p1: "s1", p2: null } }, "p1", "actor")).toBe("s1");
    expect(managerFor({ mode: "by_phase", managers: { p2: "s2" } }, "p1", "actor")).toBeNull();
    expect(managerFor({ mode: "by_phase", managers: { p1: "s1" } }, null, "actor")).toBeNull();
  });
});
