// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ScheduleViewData } from "@/lib/actions/schedule-actions";
import type { ScheduleTask } from "@/lib/types/schedule";

import {
  patchAddImprevisto,
  patchRemoveImprevisto,
  patchReplaceImprevisto,
  patchTaskFlag,
  patchTaskStatus,
} from "./optimistic";

function task(id: string, overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id,
    stableKey: `PB-${id}`,
    legacyId: null,
    planta: "PB",
    seccion: "Preliminares",
    responsable: null,
    inicio: "2026-09-14",
    fin: "2026-09-20",
    tarea: `Tarea ${id}`,
    status: "pending",
    flagged: false,
    ...overrides,
  };
}

function view(): ScheduleViewData {
  return {
    data: {
      project: { id: "p1", name: "P", address: null },
      schedule: { id: "s1", version: 1, paymentCalendarLabel: null },
      tasks: [task("t1"), task("t2", { status: "done", flagged: true })],
      payments: [],
      imprevistos: [{ id: "i1", fecha: "2026-07-01", texto: "Uno" }],
      adicionales: [],
    },
    today: "2026-09-18",
  };
}

describe("patchTaskStatus", () => {
  it("changes only the given task and leaves the input untouched", () => {
    const before = view();
    const after = patchTaskStatus(before, "t1", "progress");
    expect(after.data.tasks.map((t) => t.status)).toEqual(["progress", "done"]);
    expect(before.data.tasks[0].status).toBe("pending");
    expect(after.data.tasks[1]).toBe(before.data.tasks[1]);
    expect(after.data.payments).toBe(before.data.payments);
    expect(after.today).toBe(before.today);
  });

  it("returns the same view for an unknown task", () => {
    const before = view();
    expect(patchTaskStatus(before, "nope", "done")).toBe(before);
  });

  it("rolling back restores the previous status", () => {
    const before = view();
    const rolledBack = patchTaskStatus(patchTaskStatus(before, "t1", "done"), "t1", "pending");
    expect(rolledBack.data.tasks).toEqual(before.data.tasks);
  });
});

describe("patchTaskFlag", () => {
  it("sets the flag of the given task only", () => {
    const before = view();
    const after = patchTaskFlag(before, "t1", true);
    expect(after.data.tasks.map((t) => t.flagged)).toEqual([true, true]);
    expect(before.data.tasks[0].flagged).toBe(false);
  });

  it("clears a flag", () => {
    expect(patchTaskFlag(view(), "t2", false).data.tasks[1].flagged).toBe(false);
  });

  it("returns the same view for an unknown task", () => {
    const before = view();
    expect(patchTaskFlag(before, "nope", true)).toBe(before);
  });
});

describe("imprevistos patches", () => {
  it("adds first, replaces the temporary row and removes", () => {
    const added = patchAddImprevisto(view(), { id: "tmp", fecha: "2026-08-01", texto: "Nuevo" });
    expect(added.data.imprevistos.map((i) => i.id)).toEqual(["tmp", "i1"]);

    const saved = patchReplaceImprevisto(added, "tmp", { id: "i2", fecha: "2026-08-01", texto: "Nuevo" });
    expect(saved.data.imprevistos.map((i) => i.id)).toEqual(["i2", "i1"]);

    expect(patchRemoveImprevisto(saved, "i1").data.imprevistos.map((i) => i.id)).toEqual(["i2"]);
  });
});
