import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { mergeEventDays, mergeEventItems, mergeEventKpis, withOffset } from "@/lib/repositories/calendario-events-range";
import type { CalDay, CalEventItem, CalItem, CalKpis } from "@/lib/types/calendario";

const day = (date: string, over: Partial<CalDay> = {}): CalDay => ({
  date, tasks: 2, events: 0, overdue: 1, completed: 1, shown: 0, hours: null, workday: null, loadLabel: null, overlaps: 0, ...over,
});

function event(id: string, date: string, start: string): CalEventItem {
  return {
    kind: "event", id: `e:${id}`, eventId: id, source: "cincel", title: id, date, start, end: start, allDay: false,
    project: null, etapa: null, location: null, meetUrl: null, attendees: [], attendeeCount: 0, organizer: null,
    googleHtmlLink: null, syncedAt: null, syncError: null, minutes: "ninguna", canEdit: false,
  };
}
const task = (id: string, date: string) => ({ kind: "task", id: `t:${id}`, date }) as unknown as CalItem;

describe("withOffset", () => {
  it("formats the UTC offset of the meeting's zone", () => {
    expect(withOffset("2026-11-12T10:00:00", -360)).toBe("2026-11-12T10:00:00-06:00");
    expect(withOffset("2026-11-12T10:00:00", 330)).toBe("2026-11-12T10:00:00+05:30");
    expect(withOffset("2026-11-12T10:00:00", 0)).toBe("2026-11-12T10:00:00+00:00");
  });
});

describe("mergeEventDays", () => {
  const events = new Map([["2026-11-12", { events: 3, meetingHours: 4, overlaps: 1 }]]);
  it("adds meeting counts and overlaps to the task counts", () => {
    const out = mergeEventDays([day("2026-11-12"), day("2026-11-13")], events, { mostrar: "todo" });
    expect(out[0]).toMatchObject({ tasks: 2, events: 3, overlaps: 1 });
    expect(out[1]).toMatchObject({ tasks: 2, events: 0, overlaps: 0 });
  });
  it("mostrar = reuniones zeroes the task counts", () => {
    expect(mergeEventDays([day("2026-11-12")], events, { mostrar: "reuniones" })[0]).toMatchObject({ tasks: 0, overdue: 0, completed: 0, events: 3 });
  });
});

describe("mergeEventItems", () => {
  it("puts each day's meetings first, by start, then its tasks", () => {
    const out = mergeEventItems(
      { items: [task("a", "2026-11-12"), task("b", "2026-11-13")], truncated: false },
      { items: [event("late", "2026-11-12", "2026-11-12T15:00:00-06:00"), event("early", "2026-11-12", "2026-11-12T09:00:00-06:00")], truncated: true },
      { mostrar: "todo" },
    );
    expect(out.items.map((i) => i.id)).toEqual(["e:early", "e:late", "t:a", "t:b"]);
    expect(out.truncated).toBe(true);
  });
  it("mostrar = reuniones drops the tasks", () => {
    const out = mergeEventItems({ items: [task("a", "2026-11-12")], truncated: false }, { items: [event("x", "2026-11-12", "2026-11-12T09:00:00-06:00")], truncated: false }, { mostrar: "reuniones" });
    expect(out.items.map((i) => i.id)).toEqual(["e:x"]);
  });
});

describe("mergeEventKpis", () => {
  const kpis: CalKpis = { tasks: 5, meetings: 0, meetingHours: 0, overdue: 2, overduePct: 40, unassigned: 1 };
  it("sets the meeting KPIs and rounds hours", () => {
    expect(mergeEventKpis(kpis, { meetings: 4, meetingHours: 6.12345 }, { mostrar: "todo" })).toMatchObject({ tasks: 5, meetings: 4, meetingHours: 6.12 });
  });
  it("mostrar = reuniones keeps only the meeting numbers", () => {
    expect(mergeEventKpis(kpis, { meetings: 1, meetingHours: 1 }, { mostrar: "reuniones" })).toMatchObject({ tasks: 0, overdue: 0, unassigned: 0, meetings: 1 });
  });
});
