// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  dueDateOf,
  effectiveFilters,
  isOverdue,
  PER_DAY_LIMIT,
  sortDayItems,
  taskRowToItem,
  tramoRefOf,
  type TaskItemRow,
} from "@/lib/calendario/items";
import type { CalEventItem, CalendarioFilters, CalItem } from "@/lib/types/calendario";

const FILTERS: CalendarioFilters = {
  mostrar: "todo",
  quien: "todos",
  proyectos: [],
  tramo: null,
  responsable: "11111111-1111-4111-8111-111111111111",
  apoyo: true,
  ocultarCompletadas: false,
};

function row(patch: Partial<TaskItemRow> = {}): TaskItemRow {
  return {
    id: "a",
    title: "Tarea",
    commitmentDate: "2026-11-12",
    deliveryDate: null,
    status: "pendiente",
    priority: "media",
    customStatusName: null,
    customStatusCloses: null,
    managerId: "m1",
    managerName: "Ana",
    parentTaskId: null,
    estimatedHours: null,
    templateHours: null,
    projectId: "p1",
    projectName: "Casa",
    workflowId: null,
    workflowKey: null,
    workflowName: null,
    workflowSortOrder: null,
    workflowColorSlot: null,
    phaseId: null,
    phaseName: null,
    waiting: false,
    support: [],
    ...patch,
  };
}

describe("dueDateOf", () => {
  it("prefers the commitment date and falls back to delivery", () => {
    expect(dueDateOf({ commitmentDate: "2026-11-12", deliveryDate: "2026-11-20" })).toEqual({ date: "2026-11-12", field: "commitmentDate" });
    expect(dueDateOf({ commitmentDate: null, deliveryDate: "2026-11-20" })).toEqual({ date: "2026-11-20", field: "deliveryDate" });
    expect(dueDateOf({ commitmentDate: null, deliveryDate: null })).toBeNull();
  });
});

describe("isOverdue", () => {
  it("is overdue from org midnight of the next day, never when completed", () => {
    expect(isOverdue({ date: "2026-11-10", completed: false }, "2026-11-11")).toBe(true);
    expect(isOverdue({ date: "2026-11-11", completed: false }, "2026-11-11")).toBe(false);
    expect(isOverdue({ date: "2026-11-10", completed: true }, "2026-11-11")).toBe(false);
  });
});

describe("taskRowToItem", () => {
  it("maps dateField, ids and the overdue flag", () => {
    const item = taskRowToItem(row({ commitmentDate: null, deliveryDate: "2026-11-09" }), { today: "2026-11-11", canEdit: true });
    expect(item).toMatchObject({ kind: "task", id: "t:a", taskId: "a", date: "2026-11-09", dateField: "deliveryDate", overdue: true, canEdit: true });
  });

  it("a closing custom status completes the task and clears overdue", () => {
    const item = taskRowToItem(row({ customStatusName: "Cancelado", customStatusCloses: true, commitmentDate: "2026-11-01" }), {
      today: "2026-11-11",
      canEdit: false,
    });
    expect(item).toMatchObject({ completed: true, overdue: false, statusLabel: "Cancelado", canEdit: false });
  });

  it("hours come from the task, then the template, then 1 h", () => {
    const ctx = { today: "2026-11-11", canEdit: true };
    expect(taskRowToItem(row({ estimatedHours: 3, templateHours: 2 }), ctx)).toMatchObject({ hours: 3, hoursSource: "task" });
    expect(taskRowToItem(row({ templateHours: 2 }), ctx)).toMatchObject({ hours: 2, hoursSource: "template" });
    expect(taskRowToItem(row(), ctx)).toMatchObject({ hours: 1, hoursSource: "default" });
  });

  it("blocked by status or by an open dependency, never when completed", () => {
    const ctx = { today: "2026-11-11", canEdit: true };
    expect(taskRowToItem(row({ status: "bloqueado" }), ctx).blocked).toBe(true);
    expect(taskRowToItem(row({ waiting: true }), ctx).blocked).toBe(true);
    expect(taskRowToItem(row({ status: "completado", waiting: true }), ctx).blocked).toBe(false);
  });

  it("gives the etapa its colour slot", () => {
    const item = taskRowToItem(row({ workflowId: "w1", workflowKey: "diseno", workflowName: "Diseño", workflowSortOrder: 2 }), {
      today: "2026-11-11",
      canEdit: true,
    });
    expect(item.tramo).toEqual({ id: "w1", key: "diseno", name: "Diseño", colorSlot: 2 });
    expect(tramoRefOf({ id: "w", key: "x", name: "X", colorSlot: 5 })?.colorSlot).toBe(5);
    expect(tramoRefOf(null)).toBeNull();
  });
});

describe("effectiveFilters", () => {
  it("forces yo and drops responsable without the team calendar", () => {
    expect(effectiveFilters(FILTERS, false)).toMatchObject({ quien: "yo", responsable: null });
    expect(effectiveFilters(FILTERS, true)).toMatchObject({ quien: "todos", responsable: FILTERS.responsable });
  });
});

describe("sortDayItems", () => {
  const task = (id: string, patch: Partial<TaskItemRow>): CalItem => taskRowToItem(row({ id, title: id, ...patch }), { today: "2026-11-11", canEdit: true });
  it("orders events, overdue, open by priority, completed", () => {
    const event = { kind: "event", id: "e:1", title: "Reunión", start: "2026-11-11T09:00:00-06:00" } as CalEventItem;
    const sorted = sortDayItems([
      task("done", { status: "completado" }),
      task("baja", { priority: "baja", commitmentDate: "2026-11-11" }),
      task("alta", { priority: "alta", commitmentDate: "2026-11-11" }),
      task("tarde", { commitmentDate: "2026-11-10", priority: "baja" }),
      event,
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["e:1", "t:tarde", "t:alta", "t:baja", "t:done"]);
  });
});

describe("PER_DAY_LIMIT", () => {
  it("has the limits of each vista", () => {
    expect(PER_DAY_LIMIT).toEqual({ mes: 3, semana: 12, dia: 200 });
  });
});
