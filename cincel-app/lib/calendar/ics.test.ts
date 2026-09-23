import { describe, expect, it } from "vitest";

import { buildIcs, escapeIcsText, foldIcsLine } from "./ics";
import type { CalendarEvent } from "@/lib/types/calendar";

const event: CalendarEvent = {
  id: "c-diseno-t1-2026-12-31",
  taskId: "t1",
  date: "2026-12-31",
  time: "09:00",
  title: "Entrega: planos, fase 1; revisar",
  project: "Casa Lomas",
  responsible: "Ana",
  stage: "diseno",
  stageLabel: "Taller de Diseño",
  phase: "Anteproyecto",
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

  it("produces a valid empty calendar when there are no events", () => {
    const ics = build([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
