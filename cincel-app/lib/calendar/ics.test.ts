import { describe, expect, it } from "vitest";

import { buildIcs, escapeIcsText, foldIcsLine, type IcsMeeting } from "./ics";
import type { CalendarEvent } from "@/lib/types/calendar";

const event: CalendarEvent = {
  id: "c-diseno-t1-2026-12-31",
  taskId: "t1",
  date: "2026-12-31",
  time: "09:00",
  title: "Entrega: planos, fase 1; revisar",
  project: "Casa Lomas",
  responsible: "Ana",
  tramo: "diseno",
  tramoLabel: "Diseño",
  phaseId: "f1",
  phaseLabel: "Anteproyecto",
  type: "Fecha de entrega",
  href: "/actividades/diseno?project=Casa%20Lomas",
};

const NOW = new Date("2026-09-23T12:00:00Z");
const build = (events: CalendarEvent[]) => buildIcs(events, { baseUrl: "https://app.example", calendarName: "Cincel — Ana", now: NOW });

describe("escapeIcsText", () => {
  it("escapes backslashes, semicolons, commas and newlines", () => {
    expect(escapeIcsText("a;b,c\\d\ne")).toBe("a\;b\\,c\\\\d\\ne");
  });
});

describe("foldIcsLine", () => {
  it("leaves short lines alone and folds long ones at 75 octets with a leading space", () => {
    expect(foldIcsLine("SUMMARY:corto")).toBe("SUMMARY:corto");
    const folded = foldIcsLine("X:" + "a".repeat(200));
    const physical = folded.split("\r\n");
    expect(physical.length).toBeGreaterThan(1);
    expect(new TextEncoder().encode(physical[0]).length).toBeLessThanOrEqual(75);
    for (const cont of physical.slice(1)) {
      expect(cont.startsWith(" ")).toBe(true);
      expect(new TextEncoder().encode(cont).length).toBeLessThanOrEqual(75);
    }
    expect(physical.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe("X:" + "a".repeat(200));
  });

  it("never splits a multi-byte character", () => {
    const line = "SUMMARY:" + "ñ".repeat(100);
    const unfolded = foldIcsLine(line)
      .split("\r\n")
      .map((p, i) => (i === 0 ? p : p.slice(1)))
      .join("");
    expect(unfolded).toBe(line);
  });
});

describe("buildIcs", () => {
  it("wraps events in a VCALENDAR with CRLF line endings", () => {
    const ics = build([event]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("emits all-day events (no invented time) with an exclusive end date", () => {
    const ics = build([event]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231");
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");
    expect(ics).not.toContain("T090000");
  });

  it("escapes the title and builds an absolute link", () => {
    const ics = build([event]);
    expect(ics).toContain("SUMMARY:Entrega: planos\\, fase 1\; revisar");
    expect(ics).toContain("URL:https://app.example/actividades/diseno?project=Casa%20Lomas");
    expect(ics).toContain("UID:c-diseno-t1-2026-12-31@cincel-workspace");
    expect(ics).toContain("DTSTAMP:20260923T120000Z");
  });

  it("describes the tramo and fase of the task", () => {
    const unfold = (ics: string) => ics.replace(/\r\n /g, "");
    expect(unfold(build([event]))).toContain("Tramo: Diseño · Fase: Anteproyecto");
    expect(unfold(build([event]))).not.toContain("Etapa:");
    const noPhase = unfold(build([{ ...event, phaseId: null, phaseLabel: "" }]));
    expect(noPhase).toContain("Tramo: Diseño\\nResponsable: Ana");
    expect(noPhase).not.toContain("Fase:");
  });

  it("produces a valid empty calendar when there are no events", () => {
    const ics = build([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});

describe("buildIcs with meetings", () => {
  const meeting: IcsMeeting = {
    id: "9f1c0d2e-0000-4000-8000-000000000001",
    title: "Revisión de obra, planta baja",
    description: "Llevar planos",
    startsAt: new Date("2026-11-12T16:00:00Z"),
    endsAt: new Date("2026-11-12T17:30:00Z"),
    location: "Obra Lomas",
    meetUrl: "https://meet.example/abc-defg-hij",
    projectName: "Casa Lomas",
  };
  const withMeetings = (meetings: (typeof meeting)[]) =>
    buildIcs([event], { baseUrl: "https://app.example", calendarName: "Cincel — Ana", now: NOW, meetings });
  const unfold = (ics: string) => ics.replace(/\r\n /g, "");

  it("adds a timed VEVENT per meeting next to the task dates", () => {
    const ics = unfold(withMeetings([meeting]));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:9f1c0d2e-0000-4000-8000-000000000001@cincel\r\n");
    expect(ics).toContain("DTSTART:20261112T160000Z");
    expect(ics).toContain("DTEND:20261112T173000Z");
    expect(ics).toContain("SUMMARY:Revisión de obra\\, planta baja");
    expect(ics).toContain("LOCATION:Obra Lomas");
    expect(ics).toContain("URL:https://meet.example/abc-defg-hij");
    expect(ics).toContain("DESCRIPTION:Proyecto: Casa Lomas\\nLlevar planos");
  });

  it("links to the meeting in the calendar when there is no Meet link", () => {
    const ics = unfold(withMeetings([{ ...meeting, meetUrl: null, location: null }]));
    expect(ics).toContain("URL:https://app.example/calendario?vista=dia&fecha=2026-11-12&evento=e:9f1c0d2e-0000-4000-8000-000000000001");
    expect(ics).not.toContain("LOCATION:");
  });

  it("keeps the feed of tasks unchanged without meetings", () => {
    expect(withMeetings([])).toBe(build([event]));
  });
});

