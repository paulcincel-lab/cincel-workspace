import { describe, expect, it } from "vitest";

import {
  DEFAULT_TAREAS_QUERY,
  TAREAS_ESTADOS,
  TAREAS_MOSTRAR,
  clearTareasFilters,
  hasTareasFilters,
  parseTareasQuery,
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
    tramo: maybe(r, () => oneOf(r, TRAMO_KEYS)),
    responsable: maybe(r, () => (r() < 0.5 ? "yo" : uuid(r))),
    proyecto: maybe(r, () => uuid(r)),
    estado: maybe(r, () => oneOf(r, TAREAS_ESTADOS)),
    q: maybe(r, () => oneOf(r, SEARCHES)),
    mostrar: oneOf(r, TAREAS_MOSTRAR),
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
      { tramo: "diseno" },
      { responsable: "yo" },
      { responsable: id },
      { proyecto: id },
      { estado: "bloqueado" },
      { q: "renders" },
      { mostrar: "abiertas" },
      { mostrar: "en_retraso" },
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
      tramo: "dise no!",
      responsable: "alguien",
      proyecto: "123",
      estado: "cancelado",
      q: "   ",
      nueva: "si",
      mostrar: "vencidas",
    });
    expect(parseTareasQuery(sp)).toEqual(DEFAULT_TAREAS_QUERY);
  });

  it("keeps the valid fields when others are malformed", () => {
    const sp = new URLSearchParams({ tramo: "presale", estado: "nope", mostrar: "x" });
    expect(parseTareasQuery(sp)).toEqual({ ...DEFAULT_TAREAS_QUERY, tramo: "presale" });
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
    expect(toTareasSearch({ q: "a b", tramo: "presale", responsable: "yo" })).toBe("?tramo=presale&responsable=yo&q=a+b");
  });

  it("ignores the params of the removed view switch and Calendario view", () => {
    const sp = new URLSearchParams({ vista: "calendario", cal: "semana", fecha: "2026-11-06", tramo: "presale" });
    const query = parseTareasQuery(sp);
    expect(query).toEqual({ ...DEFAULT_TAREAS_QUERY, tramo: "presale" });
    expect(toTareasSearch(query)).toBe("?tramo=presale");
  });
});

describe("helpers", () => {
  it("toUrlSearchParams keeps the first of repeated values and skips undefined", () => {
    const sp = toUrlSearchParams({ estado: ["pendiente", "bloqueado"], tramo: "presale", q: undefined });
    expect(sp.get("estado")).toBe("pendiente");
    expect(sp.get("tramo")).toBe("presale");
    expect(sp.has("q")).toBe(false);
  });

  it("hasTareasFilters / clearTareasFilters drop every filter", () => {
    const q: TareasQuery = { ...DEFAULT_TAREAS_QUERY, tramo: "presale", q: "x" };
    expect(hasTareasFilters(q)).toBe(true);
    const cleared = clearTareasFilters();
    expect(cleared).toEqual(DEFAULT_TAREAS_QUERY);
    expect(hasTareasFilters(cleared)).toBe(false);
  });
});

describe("mostrar", () => {
  it("parses and serializes mostrar, defaults to todas", () => {
    for (const mostrar of ["abiertas", "en_retraso"] as const) {
      const href = tareasHref({ ...DEFAULT_TAREAS_QUERY, mostrar });
      expect(href).toBe(`/tareas?mostrar=${mostrar}`);
      expect(parseTareasQuery(new URLSearchParams(href.split("?")[1])).mostrar).toBe(mostrar);
    }
    expect(parseTareasQuery(new URLSearchParams("mostrar=")).mostrar).toBe("todas");
    expect(tareasHref({ ...DEFAULT_TAREAS_QUERY })).toBe("/tareas");
  });

  it("defaults to todas, which stays out of the URL", () => {
    expect(parseTareasQuery(new URLSearchParams()).mostrar).toBe("todas");
    expect(toTareasSearch({ mostrar: "todas" })).toBe("");
    expect(tareasHref({ mostrar: "en_retraso" })).toBe("/tareas?mostrar=en_retraso");
  });

  it("parses unknown values to todas", () => {
    expect(parseTareasQuery(new URLSearchParams("mostrar=vencidas")).mostrar).toBe("todas");
  });

  it("narrows the tasks and is cleared with the filters", () => {
    const q: TareasQuery = { ...DEFAULT_TAREAS_QUERY, mostrar: "abiertas" };
    expect(hasTareasFilters(q)).toBe(true);
    expect(clearTareasFilters().mostrar).toBe("todas");
  });
});

describe("Esencial responsable", async () => {
  const { esencialResponsable, hasEsencialFilters, isEsencialSoloMias, responsableFilter } = await import("./query");

  it("esencial treats a missing responsable as yo", () => {
    expect(esencialResponsable(null)).toBe("yo");
    expect(esencialResponsable("yo")).toBe("yo");
    expect(esencialResponsable("todos")).toBeNull();
    const id = "22222222-2222-4222-8222-222222222222";
    expect(esencialResponsable(id)).toBe(id);
    expect(isEsencialSoloMias(null)).toBe(true);
    expect(isEsencialSoloMias("todos")).toBe(false);
  });

  it("keeps responsable=todos through the URL, and other styles read it as no filter", () => {
    const query = parseTareasQuery(new URLSearchParams("responsable=todos"));
    expect(query.responsable).toBe("todos");
    expect(toTareasSearch(query)).toBe("?responsable=todos");
    expect(responsableFilter(query.responsable)).toBeNull();
    expect(hasTareasFilters(query)).toBe(false);
    // In Esencial, Solo mías off is a filter ("Quitar filtros" turns it back on); the default is not.
    expect(hasEsencialFilters(query)).toBe(true);
    expect(hasEsencialFilters(DEFAULT_TAREAS_QUERY)).toBe(false);
    expect(hasEsencialFilters(clearTareasFilters())).toBe(false);
  });
});
