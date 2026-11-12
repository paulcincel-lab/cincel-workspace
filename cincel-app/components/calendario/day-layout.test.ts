import { describe, expect, it } from "vitest";

import type { CalEventItem, CalTaskItem } from "@/lib/types/calendario";

import { layoutDay, nowFraction } from "./day-layout";

const TZ = "America/Mexico_City";

function event(id: string, start: string, end: string, extra: Partial<CalEventItem> = {}): CalEventItem {
  return {
    kind: "event",
    id: `e:${id}`,
    eventId: id,
    source: "cincel",
    title: id,
    date: "2026-11-11",
    start,
    end,
    allDay: false,
    project: null,
    tramo: null,
    location: null,
    meetUrl: null,
    attendees: [],
    attendeeCount: 0,
    organizer: null,
    googleHtmlLink: null,
    syncedAt: null,
    syncError: null,
    minutes: "ninguna",
    canEdit: false,
    ...extra,
  };
}

function task(id: string, completed: boolean): CalTaskItem {
  return { kind: "task", id: `t:${id}`, taskId: id, title: id, date: "2026-11-11", completed } as CalTaskItem;
}

describe("layoutDay", () => {
  it("renders the configured hours", () => {
    const l = layoutDay([], "2026-11-11", "08:00", "19:00", TZ);
    expect(l.hours).toHaveLength(11);
    expect(l.hours[0]).toBe(480);
  });

  it("puts two overlapping blocks in two lanes", () => {
    const l = layoutDay(
      [event("a", "2026-11-11T10:00:00-06:00", "2026-11-11T11:00:00-06:00"), event("b", "2026-11-11T10:30:00-06:00", "2026-11-11T11:30:00-06:00")],
      "2026-11-11",
      "08:00",
      "19:00",
      TZ,
    );
    expect(l.blocks.map((b) => [b.lane, b.lanes])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });

  it("keeps sequential blocks in one lane", () => {
    const l = layoutDay(
      [event("a", "2026-11-11T10:00:00-06:00", "2026-11-11T11:00:00-06:00"), event("b", "2026-11-11T11:00:00-06:00", "2026-11-11T12:00:00-06:00")],
      "2026-11-11",
      "08:00",
      "19:00",
      TZ,
    );
    expect(l.blocks.every((b) => b.lanes === 1)).toBe(true);
  });

  it("pins events outside the range at the edges", () => {
    const l = layoutDay(
      [event("early", "2026-11-11T06:00:00-06:00", "2026-11-11T07:00:00-06:00"), event("late", "2026-11-11T20:00:00-06:00", "2026-11-11T21:00:00-06:00")],
      "2026-11-11",
      "08:00",
      "19:00",
      TZ,
    );
    expect(l.blocks).toHaveLength(0);
    expect(l.before.map((e) => e.item.eventId)).toEqual(["early"]);
    expect(l.after.map((e) => e.item.eventId)).toEqual(["late"]);
  });

  it("lists open tasks before completed ones", () => {
    const l = layoutDay([task("done", true), task("open", false)], "2026-11-11", "08:00", "19:00", TZ);
    expect(l.tasks.map((t) => t.taskId)).toEqual(["open", "done"]);
  });
});

describe("nowFraction", () => {
  const now = new Date("2026-11-11T16:00:00Z"); // 10:00 in Mexico City
  it("shows only on today", () => {
    expect(nowFraction(now, "2026-11-11", "2026-11-12", "08:00", "19:00", TZ)).toBeNull();
    expect(nowFraction(now, "2026-11-11", "2026-11-11", "08:00", "19:00", TZ)).toBeCloseTo(2 / 11);
  });
  it("hides outside the range", () => {
    expect(nowFraction(new Date("2026-11-12T04:00:00Z"), "2026-11-11", "2026-11-11", "08:00", "19:00", TZ)).toBeNull();
  });
});
