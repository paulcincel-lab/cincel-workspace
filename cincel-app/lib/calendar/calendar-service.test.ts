import { describe, expect, it } from "vitest";

import { buildCalendarEvents } from "./calendar-service";
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

describe("buildCalendarEvents — etapa and fase", () => {
  const diseno = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };
  const ejecutivo = { id: "f1", name: "Ejecutivo", sortOrder: 1 };

  it("carries the task's etapa and fase", () => {
    const [event] = buildCalendarEvents([makeTask({ kind: "workflow", workflow: diseno, phase: ejecutivo })]);
    expect(event).toMatchObject({ etapa: "diseno", etapaLabel: "Diseño", phaseId: "f1", phaseLabel: "Ejecutivo" });
    expect(event.href).toBe("/actividades/diseno?project=Proyecto");
  });

  it("uses Sin etapa for tasks without one and Administración for admin tasks", () => {
    const [none] = buildCalendarEvents([makeTask()]);
    expect(none).toMatchObject({ etapa: "sin-etapa", etapaLabel: "Sin etapa", phaseId: null, phaseLabel: "" });
    const [admin] = buildCalendarEvents([makeTask({ kind: "admin" })]);
    expect(admin).toMatchObject({ etapa: "admin", etapaLabel: "Administración" });
  });
});
