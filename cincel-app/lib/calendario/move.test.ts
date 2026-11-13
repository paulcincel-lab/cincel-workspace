// @vitest-environment node
import { describe, expect, it } from "vitest";

import { emptyCalendarioRange } from "@/lib/calendario/empty";
import type { CalTaskItem } from "@/lib/types/calendario";

import { addMonths, columnHeading, dayCounts, hiddenCount, itemsByDate, longDayLabel, monthLabel, moveTaskInRange, weekBounds } from "./move";

const task = (over: Partial<CalTaskItem> = {}): CalTaskItem => ({
  kind: "task",
  id: "t:1",
  taskId: "1",
  title: "Ingenierías",
  date: "2026-11-09",
  dateField: "commitmentDate",
  project: null,
  etapa: null,
  phase: null,
  status: "pendiente",
  statusLabel: "Pendiente",
  priority: "media",
  manager: null,
  support: [],
  overdue: true,
  completed: false,
  blocked: false,
  hours: 1,
  hoursSource: "default",
  parentTaskId: null,
  canEdit: true,
  ...over,
});

function rangeWith(items: CalTaskItem[]) {
  const base = emptyCalendarioRange({ from: "2026-11-09", to: "2026-11-15" }, "2026-11-11");
  return {
    ...base,
    items,
    days: base.days.map((d) => (d.date === "2026-11-09" ? { ...d, tasks: 1, shown: 1, overdue: 1 } : d)),
    kpis: { ...base.kpis, overdue: 1 },
  };
}

describe("labels", () => {
  it("formats days in Spanish", () => {
    expect(longDayLabel("2026-11-12")).toBe("jueves 12 de noviembre");
    expect(columnHeading("2026-11-09")).toBe("LUN 9");
    expect(monthLabel("2026-11-11")).toBe("Noviembre 2026");
  });

  it("counts a day for its cell label", () => {
    expect(dayCounts({ tasks: 3, events: 1, overdue: 1 })).toBe("3 tareas, 1 reunión, 1 vencida");
    expect(dayCounts(undefined)).toBe("sin elementos");
  });

  it("counts what the per-day limit hides", () => {
    expect(hiddenCount({ tasks: 5, events: 1, shown: 3 }, 3)).toBe(3);
    expect(hiddenCount({ tasks: 2, events: 0, shown: 2 }, 2)).toBe(0);
  });
});

describe("dates", () => {
  it("moves by month clamping the day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-11", -1)).toBe("2026-10-11");
  });

  it("finds Monday and Sunday", () => {
    expect(weekBounds("2026-11-11")).toEqual({ start: "2026-11-09", end: "2026-11-15" });
    expect(weekBounds("2026-11-15")).toEqual({ start: "2026-11-09", end: "2026-11-15" });
  });
});

describe("itemsByDate", () => {
  it("puts meetings with a time first, then tasks by priority", () => {
    const meeting = {
      kind: "event", id: "e:1", eventId: "1", source: "cincel", title: "Junta", date: "2026-11-09",
      start: "2026-11-09T10:00:00-06:00", end: "2026-11-09T11:00:00-06:00", allDay: false,
    } as unknown as import("@/lib/types/calendario").CalEventItem;
    const low = task({ id: "t:2", taskId: "2", title: "B", priority: "baja" });
    const high = task({ id: "t:3", taskId: "3", title: "A", priority: "alta" });
    const list = itemsByDate([low, high, meeting]).get("2026-11-09") ?? [];
    expect(list.map((i) => i.id)).toEqual(["e:1", "t:3", "t:2"]);
  });
});

describe("moveTaskInRange", () => {
  it("moves the item, clears overdue and shifts the day counts", () => {
    const next = moveTaskInRange(rangeWith([task()]), "t:1", "2026-11-12");
    expect(next.items[0]).toMatchObject({ date: "2026-11-12", overdue: false });
    expect(next.days.find((d) => d.date === "2026-11-09")).toMatchObject({ tasks: 0, shown: 0, overdue: 0 });
    expect(next.days.find((d) => d.date === "2026-11-12")).toMatchObject({ tasks: 1, shown: 1, overdue: 0 });
    expect(next.kpis.overdue).toBe(0);
  });

  it("marks a task moved before today as overdue and drops one moved out of the window", () => {
    const open = rangeWith([task({ date: "2026-11-12", overdue: false })]);
    expect(moveTaskInRange(open, "t:1", "2026-11-10").items[0]).toMatchObject({ overdue: true });
    expect(moveTaskInRange(rangeWith([task()]), "t:1", "2026-12-01").items).toHaveLength(0);
  });

  it("returns the same range when nothing moves", () => {
    const range = rangeWith([task()]);
    expect(moveTaskInRange(range, "t:1", "2026-11-09")).toBe(range);
    expect(moveTaskInRange(range, "t:9", "2026-11-12")).toBe(range);
  });
});
