import { describe, expect, it } from "vitest";

import { tareasListFiltersOf } from "@/lib/query/options/tareas";

import {
  DEFAULT_TAREAS_QUERY,
  TAREAS_PROYECTOS_URL_MAX,
  clearTareasFilters,
  hasEsencialFilters,
  hasTareasFilters,
  parseProyectosParam,
  parseTareasQuery,
  proyectosPatch,
  selectedProyectos,
  tareasHref,
  toTareasSearch,
} from "./query";
import { tareasGroupFilters } from "./summary";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";

describe("Proyecto filter URL (#1045)", () => {
  it("parses a comma list: valid ids only, lowercased, deduplicated and sorted", () => {
    expect(parseProyectosParam(`${B},nope,${A.toUpperCase()},${B}, ${C} `)).toEqual([A, B, C]);
    expect(parseProyectosParam("")).toEqual([]);
    expect(parseProyectosParam(null)).toEqual([]);
    expect(parseProyectosParam("x,y")).toEqual([]);
  });

  it("keeps at most TAREAS_PROYECTOS_URL_MAX ids", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(parseProyectosParam(ids.join(","))).toHaveLength(TAREAS_PROYECTOS_URL_MAX);
  });

  it("one project stays in `proyecto`; two or more go to `proyectos`", () => {
    expect(parseTareasQuery(new URLSearchParams(`proyecto=${A}`))).toMatchObject({ proyecto: A, proyectos: [] });
    expect(parseTareasQuery(new URLSearchParams(`proyecto=${B},${A}`))).toMatchObject({ proyecto: null, proyectos: [A, B] });
    expect(parseTareasQuery(new URLSearchParams("proyecto=bad"))).toMatchObject({ proyecto: null, proyectos: [] });
  });

  it("round trips through the URL with readable commas", () => {
    const search = toTareasSearch({ ...DEFAULT_TAREAS_QUERY, ...proyectosPatch([B, A]) });
    expect(search).toBe(`?proyecto=${A},${B}`);
    expect(parseTareasQuery(new URLSearchParams(search.slice(1)))).toMatchObject({ proyecto: null, proyectos: [A, B] });
    expect(tareasHref({ proyecto: A })).toBe(`/tareas?proyecto=${A}`);
  });

  it("proyectosPatch always sets both fields, so a patch replaces the selection", () => {
    expect(proyectosPatch([])).toEqual({ proyecto: null, proyectos: [] });
    expect(proyectosPatch([A])).toEqual({ proyecto: A, proyectos: [] });
    expect(proyectosPatch([B, A, B])).toEqual({ proyecto: null, proyectos: [A, B] });
    const q = { ...DEFAULT_TAREAS_QUERY, ...proyectosPatch([A, B]) };
    expect({ ...q, ...proyectosPatch([C]) }).toMatchObject({ proyecto: C, proyectos: [] });
  });

  it("selectedProyectos reads either field", () => {
    expect(selectedProyectos(DEFAULT_TAREAS_QUERY)).toEqual([]);
    expect(selectedProyectos({ proyecto: A })).toEqual([A]);
    expect(selectedProyectos({ proyecto: null, proyectos: [A, B] })).toEqual([A, B]);
  });

  it("counts as a filter, and Quitar filtros clears it", () => {
    const q = { ...DEFAULT_TAREAS_QUERY, ...proyectosPatch([A, B]) };
    expect(hasTareasFilters(q)).toBe(true);
    expect(hasEsencialFilters({ ...q, responsable: "yo" })).toBe(true);
    const cleared = { ...q, ...clearTareasFilters() };
    expect(selectedProyectos(cleared)).toEqual([]);
    expect(toTareasSearch(cleared)).toBe("");
  });
});

describe("Proyecto filter list filters (#1045)", () => {
  it("adds `proyectos` only for two or more projects, so other keys keep their shape", () => {
    expect(tareasListFiltersOf(DEFAULT_TAREAS_QUERY)).not.toHaveProperty("proyectos");
    expect(tareasListFiltersOf({ ...DEFAULT_TAREAS_QUERY, ...proyectosPatch([A]) })).toMatchObject({ proyecto: A });
    expect(tareasListFiltersOf({ ...DEFAULT_TAREAS_QUERY, ...proyectosPatch([A]) })).not.toHaveProperty("proyectos");
    expect(tareasListFiltersOf({ ...DEFAULT_TAREAS_QUERY, ...proyectosPatch([A, B]) })).toMatchObject({
      proyecto: null,
      proyectos: [A, B],
    });
  });

  it("a tramo group is one project: it drops the multi-select", () => {
    const f = tareasListFiltersOf({ ...DEFAULT_TAREAS_QUERY, ...proyectosPatch([A, B]) });
    const group = tareasGroupFilters(f, A, null);
    expect(group).not.toHaveProperty("proyectos");
    expect(group).toMatchObject({ proyecto: A });
  });
});
