// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { selectionState, setRowsSelected, toggleRowSelection } from "@/components/widgets/table-rows";
import type { TaskBulkResult } from "@/lib/types/core";

import { bulkPatchOf, bulkPhaseOptions, bulkResultToast, commonValue, undoPatches, type TaskBulkTask } from "./task-bulk";
import { useTaskSelection } from "./use-task-selection";

const ORDER = ["a", "b", "c", "d", "e"];

describe("selection helpers (#1040)", () => {
  it("toggles one id, or a range from the anchor to the clicked id in table order", () => {
    expect([...toggleRowSelection(new Set(), "b", { order: ORDER })]).toEqual(["b"]);
    expect([...toggleRowSelection(new Set(["b"]), "b", { order: ORDER })]).toEqual([]);
    expect([...toggleRowSelection(new Set(["b"]), "d", { order: ORDER, anchor: "b", range: true })].sort()).toEqual(["b", "c", "d"]);
    // Backwards, and a range that unselects (the clicked row was on).
    expect([...toggleRowSelection(new Set(), "a", { order: ORDER, anchor: "c", range: true })].sort()).toEqual(["a", "b", "c"]);
    expect([...toggleRowSelection(new Set(ORDER), "d", { order: ORDER, anchor: "b", range: true })].sort()).toEqual(["a", "e"]);
    // No anchor, or an anchor no longer shown: only the clicked row.
    expect([...toggleRowSelection(new Set(), "d", { order: ORDER, anchor: "zz", range: true })]).toEqual(["d"]);
  });

  it("header state and set-many", () => {
    expect(selectionState(new Set(), ["a"])).toBe("none");
    expect(selectionState(new Set(["a"]), ["a", "b"])).toBe("some");
    expect(selectionState(new Set(["a", "b", "x"]), ["a", "b"])).toBe("all");
    expect(selectionState(new Set(["a"]), [])).toBe("none");
    expect([...setRowsSelected(new Set(["x"]), ["a", "b"], true)].sort()).toEqual(["a", "b", "x"]);
    expect([...setRowsSelected(new Set(["a", "x"]), ["a", "b"], false)]).toEqual(["x"]);
  });
});

describe("useTaskSelection", () => {
  it("selects one, a range, several and all; clears", () => {
    const { result } = renderHook(() => useTaskSelection({ visibleIds: ORDER }));
    act(() => result.current.toggle("b"));
    expect(result.current.count).toBe(1);
    act(() => result.current.toggle("d", { range: true }));
    expect([...result.current.selectedIds].sort()).toEqual(["b", "c", "d"]);
    expect(result.current.isSelected("c")).toBe(true);
    act(() => result.current.setMany(ORDER, true));
    expect(result.current.count).toBe(5);
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it("takes a table's controlled change as is", () => {
    const { result } = renderHook(() => useTaskSelection({ visibleIds: ORDER }));
    act(() => result.current.onSelectionChange(new Set(["a", "e"])));
    expect([...result.current.selectedIds]).toEqual(["a", "e"]);
  });

  it("resets when the filters change and drops ids no longer shown", () => {
    const { result, rerender } = renderHook((props: { visibleIds: string[]; resetKey: string }) => useTaskSelection(props), {
      initialProps: { visibleIds: ORDER, resetKey: "f1" },
    });
    act(() => result.current.setMany(["a", "b"], true));
    rerender({ visibleIds: ["b", "c"], resetKey: "f1" });
    expect([...result.current.selectedIds]).toEqual(["b"]);
    rerender({ visibleIds: ORDER, resetKey: "f2" });
    expect(result.current.count).toBe(0);
  });
});

function task(id: string, patch: Partial<TaskBulkTask> = {}): TaskBulkTask {
  return {
    id,
    projectId: "p1",
    kind: "usuario",
    title: id,
    workflowId: null,
    workflow: null,
    phaseId: null,
    phase: null,
    spaceId: null,
    space: null,
    status: "pendiente",
    customStatus: null,
    managerId: null,
    manager: null,
    priority: "media",
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    parentTaskId: null,
    support: [],
    ...patch,
  } as TaskBulkTask;
}

describe("task bulk changes", () => {
  it("maps a picked value to its one-field patch", () => {
    expect(bulkPatchOf("estatus", "completado")).toEqual({ status: "completado" });
    expect(bulkPatchOf("estatus", "custom:s1")).toEqual({ customStatusId: "s1" });
    expect(bulkPatchOf("estatus", null)).toBeNull();
    expect(bulkPatchOf("responsable", null)).toEqual({ managerId: null });
    expect(bulkPatchOf("apoyo", ["x"])).toEqual({ supportIds: ["x"] });
    expect(bulkPatchOf("fase", "f1")).toEqual({ phaseId: "f1" });
    expect(bulkPatchOf("vence", "2026-12-01")).toEqual({ dueDate: "2026-12-01" });
  });

  it("the editor shows the value every task shares", () => {
    expect(commonValue([task("a", { managerId: "m" }), task("b", { managerId: "m" })], "responsable")).toBe("m");
    expect(commonValue([task("a", { managerId: "m" }), task("b")], "responsable")).toBeNull();
    expect(commonValue([task("a", { commitmentDate: "2026-12-01" }), task("b", { deliveryDate: "2026-12-01" })], "vence")).toBe(
      "2026-12-01",
    );
    expect(commonValue([task("a")], "apoyo")).toEqual([]);
  });

  it("undo puts each updated task back, one patch per previous value", () => {
    const before = [
      task("a", { status: "pendiente" }),
      task("b", { status: "en_proceso" }),
      task("c", { status: "pendiente" }),
      task("d", { customStatus: { id: "s1", name: "Revisión", closes: false, countsAsCompleted: false } }),
    ];
    expect(undoPatches(before, "estatus", ["a", "b", "c", "d"])).toEqual([
      { ids: ["a", "c"], patch: { status: "pendiente" } },
      { ids: ["b"], patch: { status: "en_proceso" } },
      { ids: ["d"], patch: { customStatusId: "s1" } },
    ]);
    // Skipped tasks didn't change, so undo leaves them alone.
    expect(undoPatches(before, "estatus", ["b"])).toEqual([{ ids: ["b"], patch: { status: "en_proceso" } }]);
  });

  it("undo of Vence restores the date it came from, even after a clear", () => {
    const before = [
      task("a", { commitmentDate: "2026-12-01", deliveryDate: "2026-12-20" }),
      task("b", { deliveryDate: "2026-12-01" }),
    ];
    expect(undoPatches(before, "vence", ["a", "b"])).toEqual([
      { ids: ["a"], patch: { dueDate: "2026-12-01", dueField: "commitmentDate" } },
      { ids: ["b"], patch: { dueDate: "2026-12-01", dueField: "deliveryDate" } },
    ]);
  });

  it("the toast says how many changed and how many were skipped", () => {
    const result: TaskBulkResult = { updated: ["a", "b"], skipped: [{ id: "c", reason: "FORBIDDEN" }] };
    expect(bulkResultToast(result)).toBe("2 tareas actualizadas. 1 tarea no se cambió por permisos.");
    expect(bulkResultToast({ updated: ["a"], skipped: [] })).toBe("1 tarea actualizada.");
  });

  it("Fase lists the fases of the selected tasks' tramos, named by tramo when there are several", () => {
    const phases = (id: string) => [{ id: `${id}-1`, name: "Diseño" } as never];
    const t1 = task("a", { workflowId: "w1", workflow: { id: "w1", name: "Obra" } as never });
    const t2 = task("b", { workflowId: "w2", workflow: { id: "w2", name: "Proyecto" } as never });
    expect(bulkPhaseOptions([t1], phases)).toEqual([{ value: "w1-1", label: "Diseño" }]);
    expect(bulkPhaseOptions([t1, t2], phases).map((o) => o.label)).toEqual(["Obra · Diseño", "Proyecto · Diseño"]);
  });
});
