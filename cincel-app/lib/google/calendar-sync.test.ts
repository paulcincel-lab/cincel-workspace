import { describe, expect, it } from "vitest";

import { hashGoogleEvent, planSync, toDesiredEvents, toGoogleEvent } from "@/lib/google/calendar-sync";
import type { CalendarEvent } from "@/lib/types/calendar";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "task-1-compromiso",
    taskId: "task-1",
    date: "2026-12-31",
    time: "09:00",
    title: "Entregar planos",
    project: "Casa Roble",
    responsible: "Ana",
    stage: "diseno",
    stageLabel: "Diseño",
    phase: "",
    type: "Compromiso",
    href: "/actividades/diseno?task=task-1",
    ...overrides,
  } as CalendarEvent;
}

describe("toGoogleEvent", () => {
  it("makes an all-day event ending the next day, linking back into the app", () => {
    const body = toGoogleEvent(event(), "https://app.cincel.mx");
    expect(body.start).toEqual({ date: "2026-12-31" });
    expect(body.end).toEqual({ date: "2027-01-01" });
    expect(body.summary).toBe("Entregar planos");
    expect(body.source.url).toBe("https://app.cincel.mx/actividades/diseno?task=task-1");
    expect(body.description).toContain("Proyecto: Casa Roble");
    expect(body.description).not.toContain("Fase:");
    expect(body.transparency).toBe("transparent");
  });

  it("includes the phase when there is one", () => {
    expect(toGoogleEvent(event({ phase: "Inicial" }), "https://x").description).toContain("Fase: Inicial");
  });
});

describe("planSync", () => {
  const base = "https://app";

  it("creates new, patches changed, leaves unchanged and deletes vanished events", () => {
    const [same, changed, fresh] = toDesiredEvents(
      [event({ id: "a" }), event({ id: "b", title: "Nuevo título" }), event({ id: "c" })],
      base
    );
    const plan = planSync(
      [same, changed, fresh],
      [
        { eventKey: "a", googleEventId: "g-a", contentHash: same.contentHash },
        { eventKey: "b", googleEventId: "g-b", contentHash: "stale" },
        { eventKey: "gone", googleEventId: "g-gone", contentHash: "x" },
      ]
    );
    expect(plan.create.map((e) => e.eventKey)).toEqual(["c"]);
    expect(plan.update.map((e) => [e.eventKey, e.googleEventId])).toEqual([["b", "g-b"]]);
    expect(plan.delete.map((e) => e.googleEventId)).toEqual(["g-gone"]);
  });

  it("does nothing when everything is already in sync", () => {
    const desired = toDesiredEvents([event()], base);
    const existing = desired.map((e) => ({ eventKey: e.eventKey, googleEventId: "g", contentHash: e.contentHash }));
    expect(planSync(desired, existing)).toEqual({ create: [], update: [], delete: [] });
  });

  it("dedupes events sharing a key", () => {
    expect(toDesiredEvents([event(), event()], base)).toHaveLength(1);
  });

  it("hashes stably and changes when content changes", () => {
    const a = toGoogleEvent(event(), base);
    expect(hashGoogleEvent(a)).toBe(hashGoogleEvent(toGoogleEvent(event(), base)));
    expect(hashGoogleEvent(a)).not.toBe(hashGoogleEvent(toGoogleEvent(event({ date: "2027-01-02" }), base)));
  });
});
