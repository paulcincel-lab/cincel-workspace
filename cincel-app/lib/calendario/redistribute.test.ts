// @vitest-environment node
import { describe, expect, it } from "vitest";

import { loadAfterMoves, proposeRedistribution, type RedistributeInput } from "@/lib/calendario/redistribute";
import type { DayLoad } from "@/lib/types/calendario";

const STAFF = "staff-1";

function day(date: string, hours: number, workday = 6): DayLoad {
  return { date, staffId: STAFF, hours, workday, label: "libre", tasks: [], meetings: [], overlaps: [] };
}

function task(id: string, hours: number, extra: Partial<RedistributeInput["tasks"][number]> = {}): RedistributeInput["tasks"][number] {
  return { taskId: id, title: `Tarea ${id}`, hours, priority: "media", blocked: false, fixed: false, dependsOn: [], dependents: [], ...extra };
}

// 2026-11-12 is a Thursday.
function base(overrides: Partial<RedistributeInput> = {}): RedistributeInput {
  return {
    staffId: STAFF,
    date: "2026-11-12",
    target: "spread",
    horizonDays: 5,
    load: [day("2026-11-12", 9), day("2026-11-13", 2), day("2026-11-16", 5), day("2026-11-17", 0)],
    tasks: [task("a", 2, { priority: "alta" }), task("b", 2, { priority: "baja" }), task("c", 1, { priority: "media" }), task("d", 4, { priority: "media" })],
    workDays: [1, 2, 3, 4, 5],
    absences: [],
    today: "2026-11-10",
    ...overrides,
  };
}

describe("proposeRedistribution", () => {
  it("leaves the overloaded day within the workday", () => {
    const result = proposeRedistribution(base());
    const hours = Object.fromEntries(base().tasks.map((t) => [t.taskId, t.hours]));
    const after = loadAfterMoves(base().load, result.moves, hours).find((d) => d.date === "2026-11-12");
    expect(after?.after).toBeLessThanOrEqual(6);
  });

  it("is deterministic and matches the snapshot", () => {
    const first = proposeRedistribution(base());
    expect(proposeRedistribution(base())).toEqual(first);
    expect(first.moves.map((m) => [m.taskId, m.to])).toEqual([
      ["b", "2026-11-13"],
      ["d", "2026-11-17"],
    ]);
  });

  it("moves blocked tasks first, then lowest priority and largest hours", () => {
    const input = base({
      tasks: [task("a", 2, { priority: "baja" }), task("b", 1, { priority: "alta", blocked: true }), task("c", 3, { priority: "baja" })],
      load: [day("2026-11-12", 8), day("2026-11-13", 0)],
    });
    expect(proposeRedistribution(input).moves.map((m) => m.taskId)).toEqual(["b", "c"]);
  });

  it("never moves past a dependent's date nor onto a hard deadline", () => {
    const input = base({
      load: [day("2026-11-12", 8), day("2026-11-13", 0), day("2026-11-16", 0)],
      tasks: [
        task("a", 1, { priority: "baja", dependents: [{ taskId: "x", date: "2026-11-12" }] }),
        task("b", 1, { priority: "baja", fixed: true }),
        task("c", 2, { priority: "media" }),
      ],
    });
    const result = proposeRedistribution(input);
    expect(result.moves.map((m) => m.taskId)).toEqual(["c"]);
    expect(result.deferred.map((d) => d.taskId)).toEqual(["a", "b"]);
  });

  it("defers what cannot move, with the reason", () => {
    const input = base({
      load: [day("2026-11-12", 8), day("2026-11-13", 0)],
      tasks: [task("a", 2, { dependents: [{ taskId: "x", date: "2026-11-12" }] })],
    });
    const result = proposeRedistribution(input);
    expect(result.moves).toEqual([]);
    expect(result.deferred).toEqual([{ taskId: "a", title: "Tarea a", reason: "Otra tarea depende de ella ese día" }]);
  });

  it("keeps a task after the dependency that moved first", () => {
    const input = base({
      load: [day("2026-11-12", 9), day("2026-11-13", 6), day("2026-11-16", 0)],
      tasks: [task("a", 3, { priority: "baja" }), task("b", 1, { priority: "alta", dependsOn: ["a"] })],
    });
    const result = proposeRedistribution(input);
    const a = result.moves.find((m) => m.taskId === "a");
    const b = result.moves.find((m) => m.taskId === "b");
    expect(a?.to).toBe("2026-11-16");
    if (b) expect(b.to >= (a?.to ?? "")).toBe(true);
  });

  it("skips absences and days off", () => {
    const input = base({
      load: [day("2026-11-12", 8), day("2026-11-13", 0), day("2026-11-16", 0), day("2026-11-17", 0)],
      tasks: [task("a", 2)],
      absences: ["2026-11-13"],
    });
    // Friday is an absence and the weekend is off: Monday is the first option.
    expect(proposeRedistribution(input).moves[0].to).toBe("2026-11-16");
  });

  it("next_day only uses the next workday and defers what does not fit", () => {
    const input = base({
      target: "next_day",
      load: [day("2026-11-12", 9), day("2026-11-13", 5), day("2026-11-16", 0)],
      tasks: [task("a", 2, { priority: "baja" }), task("b", 1, { priority: "media" })],
    });
    const result = proposeRedistribution(input);
    expect(result.moves.map((m) => [m.taskId, m.to])).toEqual([["b", "2026-11-13"]]);
    expect(result.deferred).toEqual([{ taskId: "a", title: "Tarea a", reason: "No cabe mañana" }]);
  });

  it("does nothing when the day is within the workday", () => {
    expect(proposeRedistribution(base({ load: [day("2026-11-12", 6)] }))).toEqual({ moves: [], deferred: [] });
  });
});
