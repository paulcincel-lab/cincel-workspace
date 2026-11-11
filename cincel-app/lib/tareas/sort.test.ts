import { describe, expect, it } from "vitest";

import { parseTareasQuery, toTareasSearch } from "./query";
import {
  TASK_SORT_COLUMNS,
  describeSort,
  formatSortParam,
  nextSort,
  parseSortParam,
  tableSortOf,
} from "./sort";

describe("task table sort (#1044)", () => {
  it("round-trips every column and direction through ?orden=", () => {
    for (const orderBy of TASK_SORT_COLUMNS) {
      for (const orderDir of ["asc", "desc"] as const) {
        const value = formatSortParam(orderBy, orderDir);
        if (orderBy === "retraso" && orderDir === "asc") {
          expect(value).toBeNull();
          continue;
        }
        expect(value).toBe(`${orderBy}:${orderDir}`);
        expect(parseSortParam(value)).toEqual({ orderBy, orderDir });
      }
    }
  });

  it("reads a missing direction as asc and rejects anything else", () => {
    expect(parseSortParam("vence")).toEqual({ orderBy: "vence", orderDir: "asc" });
    expect(parseSortParam(null)).toBeNull();
    expect(parseSortParam("")).toBeNull();
    expect(parseSortParam("retraso:asc")).toBeNull();
    expect(parseSortParam("nada:asc")).toBeNull();
    expect(parseSortParam("vence:up")).toBeNull();
    expect(parseSortParam("vence:asc:x")).toBeNull();
  });

  it("keeps the sort in the Tareas URL", () => {
    const search = toTareasSearch({ orden: { orderBy: "vence", orderDir: "asc" } });
    expect(search).toBe("?orden=vence%3Aasc");
    expect(parseTareasQuery(new URLSearchParams(search)).orden).toEqual({ orderBy: "vence", orderDir: "asc" });
    expect(toTareasSearch({ orden: { orderBy: "retraso", orderDir: "asc" } })).toBe("");
    expect(parseTareasQuery(new URLSearchParams("")).orden).toBeUndefined();
  });

  it("a header click cycles asc → desc → default", () => {
    expect(nextSort(null, "vence")).toEqual({ orderBy: "vence", orderDir: "asc" });
    expect(nextSort({ orderBy: "vence", orderDir: "asc" }, "vence")).toEqual({ orderBy: "vence", orderDir: "desc" });
    expect(nextSort({ orderBy: "vence", orderDir: "desc" }, "vence")).toBeNull();
    expect(nextSort({ orderBy: "vence", orderDir: "desc" }, "titulo")).toEqual({ orderBy: "titulo", orderDir: "asc" });
    // The default column: its first click goes to desc.
    expect(nextSort(null, "retraso")).toEqual({ orderBy: "retraso", orderDir: "desc" });
  });

  it("describes the sort for the subtitle", () => {
    expect(describeSort(undefined)).toBe("ordenada por retraso");
    expect(describeSort("retraso", "asc")).toBe("ordenada por retraso");
    expect(describeSort("vence", "asc")).toBe("ordenada por vencimiento (más próximo primero)");
    expect(describeSort("prioridad", "desc")).toBe("ordenada por prioridad (baja primero)");
    for (const column of TASK_SORT_COLUMNS) expect(describeSort(column, "desc")).toMatch(/^ordenada por .+ \(.+\)$/);
  });

  it("maps the sort to the table header", () => {
    expect(tableSortOf(null)).toEqual({ key: "diasRetraso", direction: "asc" });
    expect(tableSortOf({ orderBy: "titulo", orderDir: "desc" })).toEqual({ key: "tarea", direction: "desc" });
  });
});
