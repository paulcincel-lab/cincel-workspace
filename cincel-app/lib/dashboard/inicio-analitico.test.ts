import { describe, expect, it } from "vitest";

import type { TaskListItem } from "@/lib/types/core";

import { averageDaysLateOn, tramoAssigneeRows } from "./inicio";
import { todayAgendaItems } from "./inicio-today-agenda";

const TODAY = "2026-11-09";
const diseno = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };
const presale = { id: "w1", key: "presale", name: "Presale", sortOrder: 1 };

describe("averageDaysLateOn", () => {
  it("means the days late of the tasks overdue on the day, 0 without any", () => {
    const tasks = [{ commitmentDate: "2026-11-06" }, { commitmentDate: "2026-11-01" }, { commitmentDate: null }];
    const overdueOn = (t: { commitmentDate: string | null }, day: string) => t.commitmentDate !== null && t.commitmentDate < day;
    // (3 + 8) / 2 = 5.5
    expect(averageDaysLateOn(tasks, TODAY, overdueOn)).toBe(5.5);
    expect(averageDaysLateOn(tasks, "2026-11-01", overdueOn)).toBe(0);
  });
});

describe("tramoAssigneeRows", () => {
  it("counts open, overdue and age per etapa and responsable, in etapa order", () => {
    const base = { kind: "usuario" as const, createdAt: "2026-11-04T18:00:00Z" };
    const rows = tramoAssigneeRows(
      [
        { ...base, workflow: diseno, managerId: "ana", commitmentDate: "2026-11-01" },
        { ...base, workflow: diseno, managerId: "ana", commitmentDate: null },
        { ...base, workflow: presale, managerId: "luis", commitmentDate: "2026-11-20" },
        { ...base, workflow: null, managerId: null, commitmentDate: null },
      ],
      TODAY,
    );
    expect(rows).toEqual([
      { tramo: "presale", assigneeId: "luis", open: 1, overdue: 0, ageDays: 5 },
      { tramo: "diseno", assigneeId: "ana", open: 2, overdue: 1, ageDays: 10 },
      { tramo: "sin-tramo", assigneeId: null, open: 1, overdue: 0, ageDays: 5 },
    ]);
  });
});

describe("todayAgendaItems", () => {
  function task(over: Partial<Omit<TaskListItem, "notes">> & { id: string; title: string }): Omit<TaskListItem, "notes"> {
    return {
      kind: "usuario",
      projectId: "p1",
      project: { id: "p1", name: "Oficina Polanco", clientName: null },
      workflow: diseno,
      phase: null,
      managerId: "ana",
      manager: { id: "ana", name: "Ana Ruiz" },
      status: "pendiente",
      customStatus: null,
      archived: false,
      commitmentDate: null,
      reviewDate: null,
      deliveryDate: null,
      ...over,
    } as Omit<TaskListItem, "notes">;
  }

  it("keeps today's open deliveries with their responsable, without client data", () => {
    const items = todayAgendaItems(
      [
        task({ id: "t1", title: "Entrega de planos", commitmentDate: TODAY }),
        task({ id: "t2", title: "Mañana", commitmentDate: "2026-11-10" }),
        task({ id: "t3", title: "Cerrada", commitmentDate: TODAY, status: "completado" }),
      ],
      TODAY,
    );
    const deliveries = items.filter((i) => i.kind === "entrega");
    expect(deliveries).toEqual([
      expect.objectContaining({
        id: "entrega-t1",
        title: "Entrega de planos",
        start: TODAY,
        allDay: true,
        tramo: "diseno",
        href: "/tareas?tarea=t1",
        assignee: { id: "ana", name: "Ana Ruiz", initials: "AR" },
      }),
    ]);
    // Deliveries come after the events of the day.
    expect(items[items.length - 1].kind).toBe("entrega");
    expect(JSON.stringify(items)).not.toContain("clientName");
  });
});
