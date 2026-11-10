import { describe, expect, it } from "vitest";

import type { ProgressItem } from "@/lib/types/widgets";

import { projectAtRisk, withProjectRisk } from "./inicio";

const item = (id: string): ProgressItem => ({ id, label: id, real: 50 });

describe("projectAtRisk", () => {
  it("atRisk at 45 percent", () => {
    // 9 / 20 = 45 %.
    expect(projectAtRisk({ open: 20, overdue: 9 })).toBe(true);
    // 4 / 9 = 44.4 % → 44.
    expect(projectAtRisk({ open: 9, overdue: 4 })).toBe(false);
    // 5 / 11 = 45.45 % → 45.
    expect(projectAtRisk({ open: 11, overdue: 5 })).toBe(true);
    expect(projectAtRisk({ open: 3, overdue: 3 })).toBe(true);
  });

  it("no risk with 0 open", () => {
    expect(projectAtRisk({ open: 0, overdue: 0 })).toBe(false);
  });
});

describe("withProjectRisk", () => {
  const rows = [
    { projectId: "p-1", open: 10, overdue: 6 },
    { projectId: "p-2", open: 10, overdue: 1 },
  ];

  it("flags each project from its portfolio row", () => {
    const out = withProjectRisk([item("p-1"), item("p-2"), item("p-3")], rows, true);
    expect(out.map((p) => [p.id, p.atRisk])).toEqual([
      ["p-1", true],
      ["p-2", false],
      ["p-3", false],
    ]);
  });

  it("omitted without showProjectRisk", () => {
    const out = withProjectRisk([item("p-1"), item("p-2")], rows, false);
    for (const p of out) expect("atRisk" in p).toBe(false);
  });
});
