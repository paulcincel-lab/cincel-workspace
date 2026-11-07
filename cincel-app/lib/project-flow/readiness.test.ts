import { describe, expect, it } from "vitest";

import { type GateCounts, readinessBucket, type ReadinessFacts } from "./readiness";

const created = new Date("2026-09-01T10:00:00.000Z");
const stageStarted = new Date("2026-09-10T10:00:00.000Z");
const lastClosed = new Date("2026-10-15T16:30:00.000Z");

const noTasks: GateCounts = { total: 0, closed: 0, completed: 0, maxClosedAt: null };

function facts(over: Partial<ReadinessFacts>): ReadinessFacts {
  return {
    hasRule: true,
    afterIsFirst: true,
    afterStageStartedAt: stageStarted,
    gate: noTasks,
    projectCreatedAt: created,
    ...over,
  };
}

describe("readinessBucket (BE §9.1)", () => {
  it("first tramo: every project without its stage is ready since it was created", () => {
    expect(readinessBucket(facts({ hasRule: false, afterStageStartedAt: null }))).toEqual({
      bucket: "ready",
      readySince: created,
    });
  });

  it("no stage for the previous tramo: upcoming with zero counts when it is the first tramo", () => {
    expect(readinessBucket(facts({ afterStageStartedAt: null, afterIsFirst: true }))).toEqual({
      bucket: "upcoming",
      open: 0,
      total: 0,
    });
  });

  it("no stage for the previous tramo, not the first: not listed", () => {
    expect(readinessBucket(facts({ afterStageStartedAt: null, afterIsFirst: false }))).toEqual({ bucket: "hidden" });
  });

  it("gate fase done (all completado, at least one completed): ready since the last close", () => {
    const gate = { total: 3, closed: 3, completed: 2, maxClosedAt: lastClosed };
    expect(readinessBucket(facts({ gate }))).toEqual({ bucket: "ready", readySince: lastClosed });
  });

  it("fase not contracted (no task in it): ready since the previous stage started", () => {
    expect(readinessBucket(facts({ gate: noTasks }))).toEqual({ bucket: "ready", readySince: stageStarted });
    expect(readinessBucket(facts({ gate: noTasks, afterIsFirst: false }))).toEqual({
      bucket: "ready",
      readySince: stageStarted,
    });
  });

  it("gate fase with open tasks: upcoming with open and total", () => {
    const gate = { total: 4, closed: 1, completed: 1, maxClosedAt: lastClosed };
    expect(readinessBucket(facts({ gate }))).toEqual({ bucket: "upcoming", open: 3, total: 4 });
  });

  it("gate fase all cancelled (closed, none completed): upcoming", () => {
    const gate = { total: 2, closed: 2, completed: 0, maxClosedAt: lastClosed };
    expect(readinessBucket(facts({ gate }))).toEqual({ bucket: "upcoming", open: 0, total: 2 });
  });

  it("done without a stored closed_at falls back to the stage start", () => {
    const gate = { total: 1, closed: 1, completed: 1, maxClosedAt: null };
    expect(readinessBucket(facts({ gate }))).toEqual({ bucket: "ready", readySince: stageStarted });
  });
});
