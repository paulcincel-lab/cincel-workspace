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

describe("cached formatters keep the same output", () => {
  // The header used to build a new `Intl.DateTimeFormat` per call; the cached
  // ones must render the same text, also across repeated calls and zones.
  const instants = ["2026-11-06T06:00:00Z", "2026-11-06T18:00:00Z", "2026-11-07T01:30:00Z", "2026-12-31T23:59:00Z"];

  it("renders the same greetings and dates across calls", () => {
    const render = () =>
      instants.map((iso) => [greetingFor(at(iso)), formatInicioDate(at(iso)), greetingFor(at(iso), "Europe/Madrid")]);
    const first = render();
    expect(render()).toEqual(first);
    expect(first).toEqual([
      ["Buenos días", "viernes, 6 de noviembre", "Buenos días"],
      ["Buenas tardes", "viernes, 6 de noviembre", "Buenas noches"],
      ["Buenas noches", "viernes, 6 de noviembre", "Buenos días"],
      ["Buenas tardes", "jueves, 31 de diciembre", "Buenos días"],
    ]);
  });

  it("matches a freshly built es-MX formatter", () => {
    for (const iso of instants) {
      const fresh = new Intl.DateTimeFormat("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "America/Mexico_City",
      })
        .format(at(iso))
        .toLocaleLowerCase("es-MX");
      expect(formatInicioDate(at(iso))).toBe(fresh);
    }
  });
});
