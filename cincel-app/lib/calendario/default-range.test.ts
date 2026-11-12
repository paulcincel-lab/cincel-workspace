// @vitest-environment node
import { describe, expect, it } from "vitest";

import { hasActiveCalendarioFilters } from "./filters";
import { readsRowList } from "./labels";
import { calendarioHref, defaultRangeInput, parseCalendarioQuery, rangeInputOf } from "./url-state";

const TODAY = "2026-11-11";

describe("default range per Estilo (F3)", () => {
  it("opens Visual on the month and the others on the week", () => {
    expect(defaultRangeInput("visual", TODAY)).toMatchObject({ view: "mes", from: "2026-10-26", to: "2026-12-06" });
    expect(defaultRangeInput("esencial", TODAY)).toMatchObject({ view: "semana", from: "2026-11-09", to: "2026-11-15" });
    expect(defaultRangeInput("analitico", TODAY)).toMatchObject({ view: "semana", from: "2026-11-09", to: "2026-11-15" });
  });

  it("matches the range the page reads for a URL without params", () => {
    const defaults = { vista: "mes" as const, today: TODAY, ocultarCompletadas: false };
    expect(rangeInputOf(parseCalendarioQuery("", defaults))).toEqual(defaultRangeInput("visual", TODAY));
  });

  it("follows the preference for hiding completed tasks", () => {
    expect(defaultRangeInput("visual", TODAY, { ocultarCompletadas: true }).filters.ocultarCompletadas).toBe(true);
  });

  it("only Analítico reads the paged rows", () => {
    expect(readsRowList("analitico")).toBe(true);
    expect(readsRowList("visual")).toBe(false);
    expect(readsRowList("esencial")).toBe(false);
  });
});

describe("the URL a Visual user shares", () => {
  it("keeps the semana vista that differs from the Visual default", () => {
    const defaults = { vista: "mes" as const, today: TODAY };
    const q = parseCalendarioQuery("vista=semana", defaults);
    expect(q.vista).toBe("semana");
    expect(calendarioHref(q, defaults)).toBe("/calendario?vista=semana");
  });
});

describe("hasActiveCalendarioFilters", () => {
  const base = parseCalendarioQuery("", { today: TODAY }).filters;
  it("is false for the defaults and true for each filter", () => {
    expect(hasActiveCalendarioFilters(base)).toBe(false);
    expect(hasActiveCalendarioFilters({ ...base, mostrar: "tareas" })).toBe(true);
    expect(hasActiveCalendarioFilters({ ...base, quien: "todos" })).toBe(true);
    expect(hasActiveCalendarioFilters({ ...base, proyectos: ["p"] })).toBe(true);
    expect(hasActiveCalendarioFilters({ ...base, tramo: "t" })).toBe(true);
    expect(hasActiveCalendarioFilters({ ...base, apoyo: false })).toBe(true);
    expect(hasActiveCalendarioFilters({ ...base, ocultarCompletadas: true })).toBe(true);
  });
});
