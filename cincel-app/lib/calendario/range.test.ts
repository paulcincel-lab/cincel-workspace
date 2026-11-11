import { describe, expect, it } from "vitest";

import { MONTH_GRID_DAYS, rangeOf } from "./range";

describe("rangeOf", () => {
  it("dia is the day itself", () => {
    expect(rangeOf("dia", "2026-11-11")).toEqual({ from: "2026-11-11", to: "2026-11-11" });
  });

  it("semana starts on Monday and ends on Sunday", () => {
    expect(rangeOf("semana", "2026-11-11")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(rangeOf("semana", "2026-11-09")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(rangeOf("semana", "2026-11-15")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
  });

  it("mes is a 6 week grid that starts on the Monday of the first week", () => {
    const { from, to } = rangeOf("mes", "2026-11-11");
    expect(from).toBe("2026-10-26");
    expect(to).toBe("2026-12-06");
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000 + 1).toBe(MONTH_GRID_DAYS);
  });

  it("mes keeps 42 days when the month starts on a Monday", () => {
    expect(rangeOf("mes", "2026-06-15")).toEqual({ from: "2026-06-01", to: "2026-07-12" });
  });
});
