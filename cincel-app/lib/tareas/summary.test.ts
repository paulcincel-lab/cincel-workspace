import { describe, expect, it } from "vitest";

import {
  EMPTY_SUMMARY_COUNTS,
  SIN_TRAMO_KEY,
  hiddenSummaryProjects,
  pctVencidas,
  retrasoPromedio,
  tareasGroupFilters,
  type TareasSummary,
} from "./summary";

const counts = (patch: Partial<typeof EMPTY_SUMMARY_COUNTS>) => ({ ...EMPTY_SUMMARY_COUNTS, ...patch });

describe("summary helpers", () => {
  it("pctVencidas rounds and handles 0 open", () => {
    expect(pctVencidas(counts({ open: 24, overdue: 7 }))).toBe(29);
    expect(pctVencidas(counts({ open: 7, overdue: 4 }))).toBe(57);
    expect(pctVencidas(counts({ open: 3, overdue: 1 }))).toBe(33);
    expect(pctVencidas(counts({ open: 0, overdue: 0 }))).toBe(0);
  });

  it("retrasoPromedio null without overdue", () => {
    expect(retrasoPromedio(counts({ overdue: 7, daysLateSum: 44 }))).toBe(6.3);
    expect(retrasoPromedio(counts({ overdue: 3, daysLateSum: 24 }))).toBe(8);
    expect(retrasoPromedio(counts({ overdue: 0, daysLateSum: 0 }))).toBeNull();
  });

  it("names the projects the filtered set hides, by name", () => {
    const summary: TareasSummary = {
      projects: [
        { project: { id: "a", name: "Alfa" }, ...counts({ total: 1 }), tramos: [] },
      ],
      totals: { ...counts({ total: 1 }), projects: 1 },
      unfiltered: {
        projects: 3,
        total: 9,
        projectList: [
          { id: "c", name: "Casa Valle de Bravo", total: 4, byTramo: {} },
          { id: "a", name: "Alfa", total: 3, byTramo: {} },
          { id: "b", name: "Bosque", total: 2, byTramo: {} },
        ],
      },
    };
    expect(hiddenSummaryProjects(summary).map((p) => p.name)).toEqual(["Bosque", "Casa Valle de Bravo"]);
  });

  it("tareasGroupFilters narrows to the project and tramo in retraso order", () => {
    const f = { tramo: null, proyecto: null, responsable: "yo", estado: null, q: "plano", mostrar: "en_retraso" as const };
    expect(tareasGroupFilters(f, "p1", "diseno")).toEqual({ ...f, proyecto: "p1", tramo: "diseno", orderBy: "retraso" });
    expect(tareasGroupFilters(f, "p1", null).tramo).toBe(SIN_TRAMO_KEY);
  });
});
