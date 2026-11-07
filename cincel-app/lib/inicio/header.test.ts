import { describe, expect, it } from "vitest";

import { firstNameOf, formatInicioDate, greetingFor, inicioDateLine, initialsOf } from "./header";

// Mexico City is UTC-6 all year.
const at = (iso: string) => new Date(iso);

describe("greetingFor", () => {
  it("says buenos días before noon", () => {
    expect(greetingFor(at("2026-11-06T06:00:00Z"))).toBe("Buenos días"); // 00:00
    expect(greetingFor(at("2026-11-06T17:59:00Z"))).toBe("Buenos días"); // 11:59
  });

  it("says buenas tardes from 12:00", () => {
    expect(greetingFor(at("2026-11-06T18:00:00Z"))).toBe("Buenas tardes"); // 12:00
    expect(greetingFor(at("2026-11-07T00:59:00Z"))).toBe("Buenas tardes"); // 18:59
  });

  it("says buenas noches from 19:00", () => {
    expect(greetingFor(at("2026-11-07T01:00:00Z"))).toBe("Buenas noches"); // 19:00
    expect(greetingFor(at("2026-11-07T05:59:00Z"))).toBe("Buenas noches"); // 23:59
  });
});

describe("date line", () => {
  it("formats the date in lowercase es-MX", () => {
    expect(formatInicioDate(at("2026-11-06T15:00:00Z"))).toBe("viernes, 6 de noviembre");
  });

  it("adds the event and overdue counts", () => {
    expect(inicioDateLine(at("2026-11-06T15:00:00Z"), { eventsToday: 3, overdueTasks: 2 })).toBe(
      "viernes, 6 de noviembre · 3 eventos hoy · 2 tareas vencidas",
    );
  });

  it("uses the singular for one", () => {
    expect(inicioDateLine(at("2026-11-06T15:00:00Z"), { eventsToday: 1, overdueTasks: 1 })).toBe(
      "viernes, 6 de noviembre · 1 evento hoy · 1 tarea vencida",
    );
  });

  it("uses the organization day, not UTC", () => {
    // 01:30 UTC on the 7th is still the evening of the 6th in Mexico City.
    expect(formatInicioDate(at("2026-11-07T01:30:00Z"))).toBe("viernes, 6 de noviembre");
  });
});

describe("names", () => {
  it("takes the first name", () => {
    expect(firstNameOf("  Ana María López ")).toBe("Ana");
  });

  it("builds initials from the first and last word", () => {
    expect(initialsOf("ana maría lópez")).toBe("AL");
    expect(initialsOf("Ana")).toBe("A");
    expect(initialsOf("")).toBe("");
  });
});
