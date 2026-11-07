import { describe, expect, it } from "vitest";

import { applyCalendarFilters, buildCalendarEvents, buildCalendarFilterOptions } from "./calendar-service";
import type { TaskListItem } from "@/lib/types/core";

function makeTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: "t1",
    projectId: "p1",
    kind: "usuario",
    templateId: null,
    workflowId: null,
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Tarea",
    notes: null,
    createdById: "s1",
    managerId: null,
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: "2026-06-01",
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    project: { id: "p1", name: "Proyecto", clientName: "Cliente" },
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
    customStatus: null,
    ...overrides,
  };
}

describe("buildCalendarEvents — default event time", () => {
  it("uses the task's own creation time instead of a fixed 09:00 for every Compromiso", () => {
    const createdAt = new Date();
    createdAt.setHours(14, 37, 0, 0);

    const [event] = buildCalendarEvents([makeTask({ createdAt: createdAt.toISOString() })]);

    expect(event.time).toBe("14:37");
  });

  it("falls back to the per-type default when createdAt can't be parsed", () => {
    const [event] = buildCalendarEvents([makeTask({ createdAt: "not-a-date" })]);

    expect(event.time).toBe("09:00");
  });

  it("gives two tasks created at different times different default hours", () => {
    const a = new Date();
    a.setHours(8, 5, 0, 0);
    const b = new Date();
    b.setHours(16, 42, 0, 0);

    const events = buildCalendarEvents([
      makeTask({ id: "a", createdAt: a.toISOString() }),
      makeTask({ id: "b", createdAt: b.toISOString() }),
    ]);

    const times = events.map((e) => e.time);
    expect(times).toContain("08:05");
    expect(times).toContain("16:42");
  });
});

describe("buildCalendarEvents — tramo and fase", () => {
  const diseno = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };
  const ejecutivo = { id: "f1", name: "Ejecutivo", sortOrder: 1 };

  it("carries the task's tramo and fase", () => {
    const [event] = buildCalendarEvents([makeTask({ kind: "workflow", workflow: diseno, phase: ejecutivo })]);
    expect(event).toMatchObject({ tramo: "diseno", tramoLabel: "Diseño", phaseId: "f1", phaseLabel: "Ejecutivo" });
    expect(event.href).toBe("/actividades/diseno?project=Proyecto");
  });

  it("uses Sin tramo for tasks without one and Administración for admin tasks", () => {
    const [none] = buildCalendarEvents([makeTask()]);
    expect(none).toMatchObject({ tramo: "sin-tramo", tramoLabel: "Sin tramo", phaseId: null, phaseLabel: "" });
    const [admin] = buildCalendarEvents([makeTask({ kind: "admin" })]);
    expect(admin).toMatchObject({ tramo: "admin", tramoLabel: "Administración" });
  });
});

describe("calendar filters — tramo and fase", () => {
  const diseno = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };
  const presale = { id: "w1", key: "presale", name: "Presale", sortOrder: 1 };
  const events = buildCalendarEvents([
    makeTask({ id: "a", workflow: diseno, phase: { id: "f1", name: "Ejecutivo", sortOrder: 1 } }),
    makeTask({ id: "b", workflow: diseno, phase: { id: "f2", name: "Anteproyecto", sortOrder: 0 } }),
    makeTask({ id: "c", workflow: presale, phase: null }),
  ]);

  it("lists tramos and each tramo's fases", () => {
    const options = buildCalendarFilterOptions(events);
    expect(options.tramos).toEqual(["Todos", "Diseño", "Presale"]);
    expect(options.phasesByTramo).toEqual({ Diseño: ["Todas", "Anteproyecto", "Ejecutivo"], Presale: ["Todas"] });
  });

  it("filters by tramo, then by fase within it", () => {
    const ids = (filters: Parameters<typeof applyCalendarFilters>[1]) =>
      applyCalendarFilters(events, filters).map((e) => e.taskId);
    expect(ids({})).toEqual(["a", "b", "c"]);
    expect(ids({ tramo: "Diseño" })).toEqual(["a", "b"]);
    expect(ids({ tramo: "Diseño", phase: "Ejecutivo" })).toEqual(["a"]);
    // The fase filter is ignored until a tramo is picked.
    expect(ids({ tramo: "Todos", phase: "Ejecutivo" })).toEqual(["a", "b", "c"]);
  });
});
