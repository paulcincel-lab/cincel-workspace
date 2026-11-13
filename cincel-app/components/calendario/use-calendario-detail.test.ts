import { describe, expect, it } from "vitest";

import type { TaskDetail } from "@/lib/types/core";

import { taskItemFromDetail } from "./use-calendario-detail";

const task = {
  id: "11111111-2222-4333-8444-555555555555",
  title: "Ingenierías",
  status: "pendiente",
  customStatus: null,
  priority: "media",
  commitmentDate: "2026-11-09",
  deliveryDate: null,
  project: { id: "p1", name: "Madrid 22", clientName: null },
  workflow: { id: "w1", key: "diseno", name: "Diseño", sortOrder: 2, colorSlot: 2 },
  phase: null,
  manager: null,
  support: [],
  parentTaskId: null,
} as unknown as TaskDetail;

describe("taskItemFromDetail (deep link outside the cached range)", () => {
  it("builds the t: item and marks it overdue against today", () => {
    const item = taskItemFromDetail(task, "2026-11-11");
    expect(item.id).toBe(`t:${task.id}`);
    expect(item.overdue).toBe(true);
    expect(item.date).toBe("2026-11-09");
    expect(item.etapa?.name).toBe("Diseño");
  });

  it("is not overdue once completed", () => {
    const item = taskItemFromDetail({ ...task, status: "completado" }, "2026-11-11");
    expect(item.completed).toBe(true);
    expect(item.overdue).toBe(false);
  });
});
