import { describe, expect, it } from "vitest";

import type { Proposal } from "@/lib/types/calendario";

import {
  backlogSummary,
  cellAfter,
  cellTone,
  isoWeek,
  meterLabel,
  moveInputFor,
  movedAnnouncement,
  nextCell,
  placementsOf,
  planInputFor,
  planSubtitle,
  weekDays,
} from "./plan-week-model";

const backlog = [{ taskId: "t1", title: "Ingenierías", projectName: "Madrid 22", hours: 2, priority: "alta" as never, managerId: "s1" }];
const proposal = {
  id: "p1",
  changes: [
    { changeId: "c1", type: "task_date", taskId: "t1", title: "Ingenierías", projectName: null, before: { date: null, field: "commitmentDate" }, after: { date: "2026-11-18" }, staffId: "s1" },
    { changeId: "c2", type: "task_date", taskId: "t2", title: "Sin dueño", projectName: null, before: { date: null, field: "commitmentDate" }, after: { date: "2026-11-19" }, staffId: null },
  ],
  deferred: [],
} as unknown as Proposal;

describe("plan-week-model", () => {
  it("lists Lun–Vie and the ISO week", () => {
    expect(weekDays("2026-11-16")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
    expect(isoWeek("2026-11-16")).toBe(47);
  });

  it("groups the D10 load into the three cell labels", () => {
    expect(cellTone(3, 6)).toBe("space");
    expect(cellTone(5, 6)).toBe("space");
    expect(cellTone(6, 6)).toBe("full");
    expect(cellTone(7, 6)).toBe("over");
    expect(meterLabel(4.5, 6)).toBe("4,5/6");
  });

  it("draws only the checked changes and keeps ownerless ones apart", () => {
    const { placed, unassigned } = placementsOf(proposal, ["c1", "c2"], backlog);
    expect(placed).toHaveLength(1);
    expect(unassigned.map((u) => u.title)).toEqual(["Sin dueño"]);
    expect(placementsOf(proposal, ["c2"], backlog).placed).toHaveLength(0);
    expect(cellAfter({ staffId: "s1", date: "2026-11-18", before: 3, after: 3, workday: 6 }, placed, "s1", "2026-11-18")).toBe(5);
  });

  it("builds the same inputs for every path", () => {
    expect(moveInputFor("t1", "2026-11-18")).toEqual({ moves: [{ taskId: "t1", toDate: "2026-11-18" }] });
    expect(planInputFor("2026-11-16", [], ["t1"])).toEqual({ weekStart: "2026-11-16", taskIds: ["t1"] });
    expect(planInputFor("2026-11-16", [], [])).toEqual({ weekStart: "2026-11-16" });
  });

  it("copy", () => {
    expect(backlogSummary(backlog)).toBe("1 por planear · 2 h");
    expect(movedAnnouncement("Ingenierías", "2026-11-12")).toBe("Moviste Ingenierías al jueves 12. Deshacer disponible.");
    expect(planSubtitle({ weekStart: "2026-11-16", days: [], people: [] })).toBe("Semana 47 · 16 – 20 nov · tu semana");
  });

  it("clamps arrow moves to the grid", () => {
    expect(nextCell({ row: 0, col: 0 }, "ArrowLeft", 2, 5)).toEqual({ row: 0, col: 0 });
    expect(nextCell({ row: 0, col: 4 }, "ArrowRight", 2, 5)).toEqual({ row: 0, col: 4 });
    expect(nextCell({ row: 0, col: 1 }, "ArrowDown", 2, 5)).toEqual({ row: 1, col: 1 });
  });
});
