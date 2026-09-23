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
    phase: null,
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
    manager: null,
    support: [],
    checklist: { total: 0, completed: 0 },
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
