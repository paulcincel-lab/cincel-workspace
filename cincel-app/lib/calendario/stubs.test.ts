// @vitest-environment node
import { describe, expect, it } from "vitest";

import { IMPLEMENTED } from "@/lib/actions/calendario-actions.flags";
import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { loadLabel } from "@/lib/calendario/load";
import { rangeOf } from "@/lib/calendario/range";

describe("Calendario contracts", () => {
  it("every IMPLEMENTED flag is false until its owner flips it", () => {
    const flipped = new Set<string>(["getPlanWeek"]);
    expect(Object.entries(IMPLEMENTED).every(([name, v]) => v === flipped.has(name))).toBe(true);
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
