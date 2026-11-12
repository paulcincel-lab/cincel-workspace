// @vitest-environment node
import { describe, expect, it } from "vitest";

import { IMPLEMENTED } from "@/lib/actions/calendario-actions.flags";
import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { loadLabel } from "@/lib/calendario/load";
import { rangeOf } from "@/lib/calendario/range";

describe("Calendario contracts", () => {
  it("every IMPLEMENTED flag is a boolean its owner flips", () => {
    expect(Object.values(IMPLEMENTED).every((v) => typeof v === "boolean")).toBe(true);
  });

  it("pure stubs throw not implemented", () => {
    expect(() => loadLabel(1, 6)).toThrow("not implemented: loadLabel");
  });

  it("the empty range has a zero row per day", () => {
    const { from, to } = rangeOf("semana", "2026-11-11");
    const empty = emptyCalendarioRange({ from, to });
    expect(empty.days).toHaveLength(7);
    expect(empty.days.every((d) => d.tasks === 0 && d.events === 0)).toBe(true);
  });
});
