// @vitest-environment node
import { describe, expect, it } from "vitest";

import { defaultCalVista, isoWeek, rangeLabel, shiftFecha, subtitleCounts, subtitleHead } from "./labels";

describe("calendario labels", () => {
  it("defaults the vista per Estilo (F3)", () => {
    expect(defaultCalVista("visual")).toBe("mes");
    expect(defaultCalVista("esencial")).toBe("semana");
    expect(defaultCalVista("analitico")).toBe("semana");
    expect(defaultCalVista(null)).toBe("semana");
  });

  it("numbers ISO weeks", () => {
    expect(isoWeek("2026-11-11")).toBe(46);
    expect(isoWeek("2026-01-01")).toBe(1);
    expect(isoWeek("2027-01-01")).toBe(53);
  });

  it("labels the range per vista", () => {
    expect(rangeLabel("mes", "2026-11-11")).toBe("Noviembre 2026");
    expect(rangeLabel("semana", "2026-11-11")).toBe("9 – 15 nov 2026");
    expect(rangeLabel("semana", "2026-11-30")).toBe("30 nov – 6 dic 2026");
    expect(rangeLabel("semana", "2026-12-30")).toBe("28 dic 2026 – 3 ene 2027");
    expect(rangeLabel("dia", "2026-11-11")).toBe("miércoles 11 nov 2026");
  });

  it("builds the subtitle head and counts with plurals", () => {
    expect(subtitleHead("mes", "2026-11-11", "2026-11-11")).toBe("Noviembre 2026");
    expect(subtitleHead("semana", "2026-11-11", "2026-11-11")).toBe("Semana 46");
    expect(subtitleHead("dia", "2026-11-11", "2026-11-11")).toBe("Hoy");
    expect(subtitleHead("dia", "2026-11-12", "2026-11-11")).toBe("Jueves 12 nov 2026");
    expect(subtitleCounts({ tasks: 38, meetings: 9 })).toBe("38 tareas y 9 reuniones");
    expect(subtitleCounts({ tasks: 1, meetings: 1 })).toBe("1 tarea y 1 reunión");
  });

  it("shifts the anchor by day, week and month", () => {
    expect(shiftFecha("dia", "2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftFecha("semana", "2026-11-11", -1)).toBe("2026-11-04");
    expect(shiftFecha("mes", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftFecha("mes", "2026-01-15", -1)).toBe("2025-12-15");
  });
});
