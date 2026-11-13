import { describe, expect, it } from "vitest";

import type { TaskListItem, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";
import { groupFichaTasks, hasTasksWithoutEtapa } from "./task-groups";

const PRESALE: WorkflowRef = { id: "w1", key: "presale", name: "Presale", sortOrder: 1 };
const DISENO: WorkflowRef = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };
const ANTEPROYECTO: WorkflowPhaseRef = { id: "f1", name: "Anteproyecto", sortOrder: 1 };
const EJECUTIVO: WorkflowPhaseRef = { id: "f2", name: "Ejecutivo", sortOrder: 2 };

function task(id: string, overrides: Partial<TaskListItem> = {}): TaskListItem {
  return { id, title: id, kind: "workflow", workflow: null, phase: null, ...overrides } as TaskListItem;
}

describe("groupFichaTasks", () => {
  const tasks = [
    task("t1", { workflow: DISENO, phase: EJECUTIVO }),
    task("t2", { workflow: DISENO }),
    task("t3", { workflow: DISENO, phase: ANTEPROYECTO }),
    task("t4", { workflow: PRESALE, phase: ANTEPROYECTO }),
    task("t5", { kind: "usuario" }),
    task("t6", { kind: "admin" }),
  ];

  it("groups by etapa order, then fase order with «Sin fase · revisar» last", () => {
    const groups = groupFichaTasks(tasks);
    expect(groups.map((g) => [g.name, g.count])).toEqual([
      ["Presale", 1],
      ["Diseño", 3],
      ["Sin etapa", 1],
    ]);
    expect(groups[1].phases.map((p) => [p.name, p.tasks.map((t) => t.id)])).toEqual([
      ["Anteproyecto", ["t3"]],
      ["Ejecutivo", ["t1"]],
      ["Sin fase · revisar", ["t2"]],
    ]);
    expect(groups[2].kind).toBe("sin_etapa");
  });

  it("adds «Administración» only for admins", () => {
    expect(groupFichaTasks(tasks).some((g) => g.kind === "admin")).toBe(false);
    const admin = groupFichaTasks(tasks, { includeAdmin: true }).at(-1);
    expect(admin?.name).toBe("Administración");
    expect(admin?.phases[0].tasks.map((t) => t.id)).toEqual(["t6"]);
  });

  it("detects non-admin tasks without an etapa", () => {
    expect(hasTasksWithoutEtapa(tasks)).toBe(true);
    expect(hasTasksWithoutEtapa([task("a", { kind: "admin" }), task("b", { workflow: PRESALE })])).toBe(false);
  });
});
