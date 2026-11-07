import { describe, expect, it } from "vitest";

import {
  DEFAULT_TAREAS_QUERY,
  TAREAS_CAL_MODES,
  TAREAS_ESTADOS,
  TAREAS_VISTAS,
  clearTareasFilters,
  hasTareasFilters,
  parseTareasQuery,
  tareasCalendarRange,
  tareasHref,
  toTareasSearch,
  toUrlSearchParams,
  type TareasQuery,
} from "./query";

/** Small seeded PRNG (mulberry32) so the property runs are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = ReturnType<typeof rng>;

function oneOf<T>(r: Rand, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)];
}

function maybe<T>(r: Rand, make: () => T): T | null {
  return r() < 0.5 ? null : make();
}

function uuid(r: Rand): string {
  const hex = () => Math.floor(r() * 16).toString(16);
  const part = (n: number) => Array.from({ length: n }, hex).join("");
  return `${part(8)}-${part(4)}-${part(4)}-${part(4)}-${part(12)}`;
}

const TRAMO_KEYS = ["presale", "diseno", "construccion", "decoracion", "tramo_2", "a-b"];
const SEARCHES = ["plano", "Cambiar tapas", "niño & café", "a+b=c", "100%", "¿qué?", "?q=1&x=2", "línea #3"];

function randomQuery(r: Rand): TareasQuery {
  return {
    vista: oneOf(r, TAREAS_VISTAS),
    cal: oneOf(r, TAREAS_CAL_MODES),
    tramo: maybe(r, () => oneOf(r, TRAMO_KEYS)),
    responsable: maybe(r, () => (r() < 0.5 ? "yo" : uuid(r))),
    proyecto: maybe(r, () => uuid(r)),
    estado: maybe(r, () => oneOf(r, TAREAS_ESTADOS)),
    q: maybe(r, () => oneOf(r, SEARCHES)),
    nueva: r() < 0.5,
  };
}

function roundTrip(q: Partial<TareasQuery>): TareasQuery {
  const search = toTareasSearch(q);
  return parseTareasQuery(new URLSearchParams(search.startsWith("?") ? search.slice(1) : search));
}

describe("parseTareasQuery / toTareasSearch", () => {
  it("round trips every field (500 random queries)", () => {
    const r = rng(20261107);
    for (let i = 0; i < 500; i++) {
      const q = randomQuery(r);
      expect(roundTrip(q)).toEqual(q);
    }
  });

  it("round trips each field on its own", () => {
    const id = "0b9c1f7e-3a4d-4c2b-9e8f-1a2b3c4d5e6f";
    const cases: Partial<TareasQuery>[] = [
      { vista: "lista" },
      { vista: "calendario", cal: "semana" },
      { cal: "dia" },
      { tramo: "diseno" },
      { responsable: "yo" },
      { responsable: id },
      { proyecto: id },
      { estado: "bloqueado" },
      { q: "renders" },
      { nueva: true },
    ];
    for (const partial of cases) {
      expect(roundTrip(partial)).toEqual({ ...DEFAULT_TAREAS_QUERY, ...partial });
    }
  });

  it("parses the empty URL as the defaults and writes the defaults as an empty search", () => {
    expect(parseTareasQuery(new URLSearchParams())).toEqual(DEFAULT_TAREAS_QUERY);
    expect(toTareasSearch(DEFAULT_TAREAS_QUERY)).toBe("");
    expect(toTareasSearch({})).toBe("");
    expect(tareasHref({})).toBe("/tareas");
  });

  it("falls back to the defaults for unknown or malformed values", () => {
    const sp = new URLSearchParams({
      vista: "kanban",
      cal: "anio",
      tramo: "dise no!",
      responsable: "alguien",
      proyecto: "123",
      estado: "cancelado",
      q: "   ",
      nueva: "si",
    });
    expect(parseTareasQuery(sp)).toEqual(DEFAULT_TAREAS_QUERY);
  });

  it("keeps the valid fields when others are malformed", () => {
    const sp = new URLSearchParams({ vista: "lista", cal: "x", tramo: "presale", estado: "nope" });
    expect(parseTareasQuery(sp)).toEqual({ ...DEFAULT_TAREAS_QUERY, vista: "lista", tramo: "presale" });
  });

  it("trims and caps the search text", () => {
    expect(parseTareasQuery(new URLSearchParams({ q: "  plano  " })).q).toBe("plano");
    expect(parseTareasQuery(new URLSearchParams({ q: "x".repeat(500) })).q).toHaveLength(200);
  });

  it("lower-cases ids", () => {
    const id = "0B9C1F7E-3A4D-4C2B-9E8F-1A2B3C4D5E6F";
    expect(parseTareasQuery(new URLSearchParams({ proyecto: id })).proyecto).toBe(id.toLowerCase());
  });

  it("writes params in a fixed order with a leading ?", () => {
    expect(toTareasSearch({ q: "a b", tramo: "presale", vista: "lista", responsable: "yo" })).toBe(
      "?vista=lista&tramo=presale&responsable=yo&q=a+b",
    );
  });
});

describe("helpers", () => {
  it("toUrlSearchParams keeps the first of repeated values and skips undefined", () => {
    const sp = toUrlSearchParams({ vista: ["lista", "tablero"], tramo: "presale", q: undefined });
    expect(sp.get("vista")).toBe("lista");
    expect(sp.get("tramo")).toBe("presale");
    expect(sp.has("q")).toBe(false);
  });

  it("hasTareasFilters / clearTareasFilters keep the view and drop every filter", () => {
    const q: TareasQuery = { ...DEFAULT_TAREAS_QUERY, vista: "calendario", cal: "semana", tramo: "presale", q: "x" };
    expect(hasTareasFilters(q)).toBe(true);
    const cleared = clearTareasFilters(q);
    expect(cleared).toEqual({ ...DEFAULT_TAREAS_QUERY, vista: "calendario", cal: "semana" });
    expect(hasTareasFilters(cleared)).toBe(false);
    expect(hasTareasFilters({ ...DEFAULT_TAREAS_QUERY, vista: "lista" })).toBe(false);
  });

  it("tareasCalendarRange pads the month to whole weeks, Monday first", () => {
    // Friday 6 Nov 2026: November starts on a Sunday and ends on a Monday.
    const today = new Date(2026, 10, 6);
    expect(tareasCalendarRange("mes", today)).toEqual({ from: "2026-10-26", to: "2026-12-06" });
    expect(tareasCalendarRange("semana", today)).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(tareasCalendarRange("dia", today)).toEqual({ from: "2026-11-06", to: "2026-11-06" });
  });
});
