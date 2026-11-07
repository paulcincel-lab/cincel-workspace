import { describe, expect, it } from "vitest";

import { daysLate, tableroTable, taskDueDate } from "@/components/tareas/tablero-table";
import type { TaskListItem } from "@/lib/types/core";
import type { TaskBoard } from "@/lib/types/redesign";

function makeTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: "t1",
    projectId: "p1",
    kind: "workflow",
    templateId: null,
    workflowId: "w1",
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Tarea",
    notes: null,
    createdById: "s1",
    managerId: null,
    status: "pendiente",
    customStatusId: null,
    priority: "alta",
    sortOrder: null,
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    customStatus: null,
    project: { id: "p1", name: "Casa Lomas", clientName: null },
    workflow: null,
    phase: null,
    space: null,
    manager: null,
    support: [],
    checklist: { total: 0, completed: 0 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    waitingOn: 0,
    ...overrides,
  } as TaskListItem;
}

const TODAY = "2026-11-07";

const BOARD: TaskBoard = {
  pendiente: [
    makeTask({
      id: "t1",
      title: "Levantamiento",
      commitmentDate: "2026-11-01",
      workflow: { id: "w1", key: "diseno", name: "Diseño", sortOrder: 2 },
      phase: { id: "f1", name: "Anteproyecto", sortOrder: 1 },
      manager: { id: "s1", name: "Ana Ruiz" },
      subtaskCount: 4,
      subtaskDoneCount: 1,
    }),
  ],
  en_proceso: [
    makeTask({
      id: "t2",
      title: "Render",
      status: "en_proceso",
      priority: "baja",
      deliveryDate: "2026-11-05",
      customStatus: { id: "cs1", name: "En revisión", closes: false, countsAsCompleted: false },
      subtaskCount: 2,
      subtaskDoneCount: 2,
    }),
  ],
  completado: [makeTask({ id: "t3", title: "Contrato", status: "completado", commitmentDate: "2026-10-01" })],
  bloqueado: [makeTask({ id: "t4", title: "Permiso", status: "bloqueado", commitmentDate: "2026-12-01" })],
};

describe("tableroTable", () => {
  const table = tableroTable(BOARD, TODAY);

  it("has the 10 Analítico columns in order", () => {
    expect(table.columns.map((c) => c.label)).toEqual([
      "Tarea",
      "Proyecto",
      "Tramo",
      "Fase",
      "Responsable",
      "Estatus",
      "Prioridad",
      "Vence",
      "Días de retraso",
      "Subtareas",
    ]);
  });

  it("keeps only tarea, proyecto, responsable and vence in Esencial", () => {
    const esencial = table.columns.filter((c) => !c.hideOn?.includes("esencial")).map((c) => c.key);
    expect(esencial).toEqual(["tarea", "proyecto", "responsable", "vence"]);
    expect(table.columns.every((c) => !c.hideOn?.includes("analitico"))).toBe(true);
  });

  it("has one row per board task, keyed by task id, in status order", () => {
    expect(table.rows.map((r) => r.id)).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("maps the task fields into the row", () => {
    expect(table.rows[0]).toEqual({
      id: "t1",
      tarea: "Levantamiento",
      proyecto: "Casa Lomas",
      tramo: "Diseño",
      fase: "Anteproyecto",
      responsable: "Ana Ruiz",
      estatus: "Pendiente",
      prioridad: "Alta",
      vence: "2026-11-01",
      diasRetraso: 6,
      subtareas: "1/4",
    });
    // Custom status name wins; delivery date is the fallback due date.
    expect(table.rows[1]).toMatchObject({ estatus: "En revisión", prioridad: "Baja", vence: "2026-11-05", diasRetraso: 2 });
    // Missing tramo / fase / responsable / subtareas stay empty.
    expect(table.rows[3]).toMatchObject({ tramo: null, fase: null, responsable: null, subtareas: null, diasRetraso: 0 });
  });

  it("adds a totals row and delay heat", () => {
    expect(table.totals).toEqual({ tarea: "Total · 4 tareas", diasRetraso: 8, subtareas: "3/6" });
    expect(table.heat).toEqual([{ key: "diasRetraso", warnAt: 0, critAt: 7 }]);
  });

  it("handles an empty board", () => {
    const empty = tableroTable({ pendiente: [], en_proceso: [], completado: [], bloqueado: [] }, TODAY);
    expect(empty.rows).toEqual([]);
    expect(empty.totals).toEqual({ tarea: "Total · 0 tareas", diasRetraso: 0, subtareas: "—" });
  });
});

describe("daysLate", () => {
  it("counts whole days past due for open tasks only", () => {
    expect(daysLate(makeTask({ commitmentDate: "2026-11-06" }), TODAY)).toBe(1);
    expect(daysLate(makeTask({ commitmentDate: "2026-11-07" }), TODAY)).toBe(0);
    expect(daysLate(makeTask({ commitmentDate: "2026-11-20" }), TODAY)).toBe(0);
    expect(daysLate(makeTask({ commitmentDate: "2026-10-01", status: "completado" }), TODAY)).toBe(0);
    expect(daysLate(makeTask(), TODAY)).toBe(0);
  });

  it("reads the date part of a timestamp", () => {
    expect(taskDueDate(makeTask({ commitmentDate: "2026-11-01T18:00:00.000Z" }))).toBe("2026-11-01");
  });
});
