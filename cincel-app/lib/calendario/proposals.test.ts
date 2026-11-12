// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  SKIP_CHANGED_AFTER_APPLY,
  SKIP_GONE,
  SKIP_NOT_UNDOABLE,
  diffRows,
  isStale,
  sameValue,
  undoPlan,
  type UndoPayload,
} from "@/lib/calendario/proposals";
import { applyToast, dateLabel, undoToast } from "@/lib/calendario/copy";
import type { AppliedChange, ProposalChange } from "@/lib/types/calendario";

const move: ProposalChange = {
  changeId: "c1",
  type: "task_date",
  taskId: "t1",
  title: "Revisar planos",
  projectName: "Casa Lomas",
  before: { date: "2026-11-10", field: "commitmentDate" },
  after: { date: "2026-11-12" },
  staffId: null,
};

const applied = (changeId: string, entity: AppliedChange["entity"], undo: UndoPayload): AppliedChange => ({
  changeId,
  entity,
  entityId: `${changeId}-id`,
  undo,
});

describe("isStale", () => {
  it("is stale when the task date is no longer the before date", () => {
    expect(isStale(move, "2026-11-10")).toBe(false);
    expect(isStale(move, "2026-11-11")).toBe(true);
    expect(isStale(move, null)).toBe(true);
  });

  it("compares only the fields the event patch names, instants by time", () => {
    const change: ProposalChange = {
      changeId: "c2",
      type: "event_update",
      eventId: "e1",
      before: { start: "2026-11-12T10:00:00-06:00" },
      after: { start: "2026-11-12T11:00:00-06:00" },
      notify: true,
    };
    expect(isStale(change, { start: "2026-11-12T16:00:00Z", title: "otro" })).toBe(false);
    expect(isStale(change, { start: "2026-11-12T17:00:00Z" })).toBe(true);
    expect(isStale(change, null)).toBe(true);
  });

  it("never marks creates, cancels or decisions as stale", () => {
    expect(isStale({ changeId: "c3", type: "event_cancel", eventId: "e1", notify: false }, "x")).toBe(false);
    expect(isStale({ changeId: "c4", type: "decision", minutesId: "m1", text: "Cuarzo blanco" }, undefined)).toBe(false);
  });
});

describe("sameValue", () => {
  it("treats null and undefined as equal and arrays by content", () => {
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue([1, 2], [1, 2])).toBe(true);
    expect(sameValue("a", "b")).toBe(false);
  });
});

describe("diffRows", () => {
  it("returns one row per change", () => {
    const rows = diffRows([move, { changeId: "c5", type: "event_cancel", eventId: "e1", notify: false }]);
    expect(rows).toEqual([
      { changeId: "c1", title: "Revisar planos", before: "2026-11-10", after: "2026-11-12" },
      { changeId: "c5", title: "Reunión", before: null, after: "Cancelada" },
    ]);
  });
});

describe("undoPlan", () => {
  const dateUndo: UndoPayload = { type: "task_date", field: "commitmentDate", before: "2026-11-10", after: "2026-11-12" };

  it("restores a task only while it still holds the applied date", () => {
    const plan = undoPlan([applied("a", "task", dateUndo), applied("b", "task", dateUndo)], { a: "2026-11-12", b: "2026-11-20" });
    expect(plan.restore.map((r) => r.changeId)).toEqual(["a"]);
    expect(plan.skipped).toEqual([{ changeId: "b", reason: SKIP_CHANGED_AFTER_APPLY }]);
  });

  it("skips rows that are gone and cancels that cannot be undone", () => {
    const plan = undoPlan([applied("a", "task", dateUndo), applied("b", "event", { type: "event_cancel" })], {});
    expect(plan.restore).toEqual([]);
    expect(plan.skipped).toEqual([
      { changeId: "a", reason: SKIP_GONE },
      { changeId: "b", reason: SKIP_NOT_UNDOABLE },
    ]);
  });

  it("restores created rows and unchanged event edits", () => {
    const plan = undoPlan(
      [
        applied("a", "event", { type: "event_create" }),
        applied("b", "task", { type: "task_create" }),
        applied("c", "decision", { type: "decision", text: "x", projectId: null }),
        applied("d", "event", { type: "event_update", before: { title: "A" }, after: { title: "B" } }),
      ],
      { a: "exists", b: "exists", c: "exists", d: { title: "B", end: "otro" } },
    );
    expect(plan.restore.map((r) => r.changeId)).toEqual(["a", "b", "c", "d"]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips an event edit changed after apply", () => {
    const plan = undoPlan([applied("d", "event", { type: "event_update", before: { title: "A" }, after: { title: "B" } })], { d: { title: "C" } });
    expect(plan.skipped).toEqual([{ changeId: "d", reason: SKIP_CHANGED_AFTER_APPLY }]);
  });
});

describe("toasts", () => {
  it("names the date of a move", () => {
    expect(dateLabel("2026-11-12")).toBe("jueves 12 nov.");
    expect(applyToast({ applied: ["a", "b", "c"], skipped: [] }, "mover_tareas", "2026-11-12")).toBe("Moví 3 tareas al jueves 12 nov.");
  });

  it("counts partial applies with the reason", () => {
    expect(applyToast({ applied: ["a", "b"], skipped: [{ changeId: "c", reason: "Sin permiso" }] }, "mover_tareas")).toBe(
      "Apliqué 2 de 3 cambios. 1 no se pudo: sin permiso.",
    );
  });

  it("undo toasts", () => {
    expect(undoToast({ restored: ["a"], skipped: [] })).toBe("Cambio deshecho.");
    expect(undoToast({ restored: ["a", "b"], skipped: [{ changeId: "c", reason: "x" }] })).toBe(
      "Deshice 2 de 3 cambios; 1 cambió después de aplicar.",
    );
  });
});
