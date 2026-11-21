import { describe, expect, it } from "vitest";

import { qk } from "@/lib/query/keys";

import { bulkInvalidations, undoPatches, type TaskBulkTask } from "./task-bulk";

function task(id: string, patch: Partial<TaskBulkTask> = {}): TaskBulkTask {
  return {
    id,
    projectId: "p1",
    kind: "usuario",
    title: `Tarea ${id}`,
    workflowId: null,
    workflow: null,
    phaseId: null,
    status: "pendiente",
    customStatus: null,
    customStatusId: null,
    managerId: null,
    commitmentDate: null,
    deliveryDate: null,
    support: [],
    ...patch,
  } as unknown as TaskBulkTask;
}

describe("undoPatches · subtasks moved with their parent (#1168)", () => {
  it("puts each parent and each subtask back to the status it had", () => {
    const before = [task("a"), task("b", { status: "en_proceso" })];
    const undo = undoPatches(before, "estatus", ["a", "b", "s1", "s2", "s3"], [
      { id: "s1", parentId: "a", status: "pendiente", customStatusId: null },
      { id: "s2", parentId: "a", status: "pendiente", customStatusId: null },
      { id: "s3", parentId: "b", status: "bloqueado", customStatusId: null },
    ]);
    expect(undo).toEqual([
      { ids: ["a"], patch: { status: "pendiente" } },
      { ids: ["b"], patch: { status: "en_proceso" } },
      { ids: ["s1", "s2"], patch: { status: "pendiente" } },
      { ids: ["s3"], patch: { status: "bloqueado" } },
    ]);
  });

  it("a subtask in a custom status goes back to it", () => {
    const undo = undoPatches([task("a")], "estatus", ["a", "s1"], [
      { id: "s1", parentId: "a", status: "en_proceso", customStatusId: "cs-qa" },
    ]);
    expect(undo[undo.length - 1]).toEqual({ ids: ["s1"], patch: { customStatusId: "cs-qa" } });
  });

  it("leaves out the subtasks the server did not update", () => {
    const undo = undoPatches([task("a")], "estatus", ["a"], [
      { id: "s1", parentId: "a", status: "pendiente", customStatusId: null },
    ]);
    expect(undo).toEqual([{ ids: ["a"], patch: { status: "pendiente" } }]);
  });

  it("subtasks only matter for Estatus", () => {
    const undo = undoPatches([task("a", { managerId: "m1" })], "responsable", ["a", "s1"], [
      { id: "s1", parentId: "a", status: "pendiente", customStatusId: null },
    ]);
    expect(undo).toEqual([{ ids: ["a"], patch: { managerId: "m1" } }]);
  });
});

describe("bulkInvalidations · subtasks", () => {
  it("refreshes the board, each task's subtasks and the moved subtasks' detail", () => {
    const keys = bulkInvalidations([task("a")], ["s1"]).map((k) => JSON.stringify(k));
    expect(keys).toContain(JSON.stringify([...qk.tareas.all, "board"]));
    expect(keys).toContain(JSON.stringify(qk.tasks.subtasks("a")));
    expect(keys).toContain(JSON.stringify(qk.tasks.children("a")));
    expect(keys).toContain(JSON.stringify(qk.tasks.detail("s1")));
  });
});
