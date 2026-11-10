import { describe, expect, it } from "vitest";

import type { AgendaItem } from "@/lib/types/widgets";

import { agendaTaskId, myAttentionCount, myWeekOf, weekSundayOf } from "./inicio";

const TZ = "America/Mexico_City";

type T = { id: string; title: string; managerId: string | null; support?: { id: string }[]; date: string; time?: string };

const task = (over: Partial<T> & { id: string; date: string }): T => ({ title: over.id, managerId: "ana", ...over });

/** One agenda item per task on its date (as `toAgendaItems({ kind: "tasks" })` does for the commitment). */
const toItems = (tasks: T[]): AgendaItem[] =>
  tasks.map((t) => ({
    id: `c-${t.id}-${t.date}`,
    title: t.title,
    start: `${t.date}T${t.time ?? "09:00"}`,
    estimated: true,
    href: `/tareas?tarea=${t.id}`,
  }));

const todayItem = (id: string, start: string, href?: string): AgendaItem => ({ id, title: id, start, ...(href ? { href } : {}) });

describe("myWeekOf", () => {
  // Wednesday 11 Nov 2026: tomorrow is Thursday 12, the week closes on Sunday 15.
  const DAY = "2026-11-11";

  it("today plus tomorrow to Sunday in Mexico City", () => {
    const today = [todayItem("hoy", "2026-11-11T17:00:00Z", "/tareas?tarea=t-hoy")];
    const week = myWeekOf({
      tasks: [
        task({ id: "t-today", date: "2026-11-11" }),
        task({ id: "t-thu", date: "2026-11-12" }),
        task({ id: "t-sun", date: "2026-11-15" }),
        task({ id: "t-mon", date: "2026-11-16" }),
        task({ id: "t-past", date: "2026-11-10" }),
      ],
      viewerId: "ana",
      toItems,
      today,
      day: DAY,
      tz: TZ,
    });
    expect(week.today).toBe(today);
    expect(week.week.map((i) => agendaTaskId(i))).toEqual(["t-thu", "t-sun"]);
    // t-hoy, t-thu, t-sun.
    expect(week.total).toBe(3);
  });

  it("reads an instant start in Mexico City (Sunday 23:30 local is still this week)", () => {
    const week = myWeekOf({
      tasks: [task({ id: "t-late", date: "2026-11-15" })],
      viewerId: "ana",
      // 2026-11-16T05:30Z is 23:30 on Sunday 15 in Mexico City (UTC−6).
      toItems: () => [{ id: "x", title: "Tarde", start: "2026-11-16T05:30:00Z", href: "/tareas?tarea=t-late" }],
      today: [],
      day: DAY,
      tz: TZ,
    });
    expect(week.week.map((i) => i.id)).toEqual(["x"]);
  });

  it("only items involving the caller", () => {
    const week = myWeekOf({
      tasks: [
        task({ id: "mine", date: "2026-11-12" }),
        task({ id: "support", date: "2026-11-12", managerId: "luis", support: [{ id: "ana" }] }),
        task({ id: "other", date: "2026-11-12", managerId: "luis" }),
        task({ id: "nobody", date: "2026-11-12", managerId: null }),
      ],
      viewerId: "ana",
      toItems,
      today: [],
      day: DAY,
      tz: TZ,
    });
    expect(week.week.map((i) => agendaTaskId(i)).sort()).toEqual(["mine", "support"]);
    expect(week.total).toBe(2);
  });

  it("sorted by date then time", () => {
    const week = myWeekOf({
      tasks: [
        task({ id: "fri-late", date: "2026-11-13", time: "16:00" }),
        task({ id: "thu", date: "2026-11-12", time: "18:00" }),
        task({ id: "fri-early", date: "2026-11-13", time: "08:00" }),
      ],
      viewerId: "ana",
      toItems,
      today: [],
      day: DAY,
      tz: TZ,
    });
    expect(week.week.map((i) => agendaTaskId(i))).toEqual(["thu", "fri-early", "fri-late"]);
  });

  it("Sunday has an empty week section", () => {
    const week = myWeekOf({
      tasks: [task({ id: "mon", date: "2026-11-16" }), task({ id: "sun", date: "2026-11-15" })],
      viewerId: "ana",
      toItems,
      today: [todayItem("e-1", "2026-11-15T10:00")],
      day: "2026-11-15",
      tz: TZ,
    });
    expect(week.week).toEqual([]);
    expect(week.today).toHaveLength(1);
    // An event is not a task.
    expect(week.total).toBe(0);
  });

  it("counts a task once when it has several items", () => {
    const week = myWeekOf({
      tasks: [task({ id: "t-1", date: "2026-11-12" })],
      viewerId: "ana",
      toItems: (tasks) => [...toItems(tasks), { id: "r-t-1", title: "Revisión", start: "2026-11-13T09:00", href: "/tareas?tarea=t-1" }],
      today: [],
      day: DAY,
      tz: TZ,
    });
    expect(week.week).toHaveLength(2);
    expect(week.total).toBe(1);
  });
});

describe("weekSundayOf", () => {
  it("closes the Monday-first week on Sunday", () => {
    expect(weekSundayOf("2026-11-09")).toBe("2026-11-15");
    expect(weekSundayOf("2026-11-14")).toBe("2026-11-15");
    expect(weekSundayOf("2026-11-15")).toBe("2026-11-15");
  });
});

describe("myAttentionCount", () => {
  it("counts the attention items assigned to or supported by the caller", () => {
    const attention = [
      { id: "a", assignee: { id: "ana", name: "Ana", initials: "A" } },
      { id: "b", assignee: { id: "luis", name: "Luis", initials: "L" } },
      { id: "c", assignee: null },
    ];
    const tasks = [
      { id: "a", managerId: "ana" },
      { id: "b", managerId: "luis", support: [{ id: "ana" }] },
      { id: "c", managerId: null },
    ];
    expect(myAttentionCount(attention, tasks, "ana")).toBe(2);
    expect(myAttentionCount(attention, tasks, "marta")).toBe(0);
  });
});
