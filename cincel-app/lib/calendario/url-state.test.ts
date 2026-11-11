import { describe, expect, it } from "vitest";

import {
  DEFAULT_CALENDARIO_FILTERS,
  calendarioHref,
  normalizeCalendarioFilters,
  parseCalendarioQuery,
  toCalendarioSearch,
} from "./url-state";

const TODAY = "2026-11-11";
const ID = "0b6f1c9e-4f3a-4c63-8f4f-2f6d0a5f7d11";
const OTHER = "1c7a2d0f-5a4b-4d74-9a5a-3a7e1b6a8e22";

describe("parseCalendarioQuery", () => {
  it("fills defaults", () => {
    const q = parseCalendarioQuery("", { today: TODAY, vista: "mes" });
    expect(q).toMatchObject({ vista: "mes", fecha: TODAY, modo: null, evento: null, tarea: null, propuesta: null, nueva: null });
    expect(q.filters).toEqual(DEFAULT_CALENDARIO_FILTERS);
  });

  it("reads every parameter", () => {
    const q = parseCalendarioQuery(
      `?vista=dia&fecha=2026-11-12&mostrar=reuniones&quien=todos&proyectos=${OTHER},${ID}&tramo=${ID}&responsable=${OTHER}&apoyo=0&ocultar=1&modo=planear&evento=e:${ID}&nueva=reunion`,
      { today: TODAY },
    );
    expect(q.vista).toBe("dia");
    expect(q.fecha).toBe("2026-11-12");
    expect(q.filters).toEqual({
      mostrar: "reuniones",
      quien: "todos",
      proyectos: [ID, OTHER].sort(),
      tramo: ID,
      responsable: OTHER,
      apoyo: false,
      ocultarCompletadas: true,
    });
    expect(q.modo).toBe("planear");
    expect(q.evento).toBe(`e:${ID}`);
    expect(q.nueva).toBe("reunion");
  });

  it("falls back on invalid values", () => {
    const q = parseCalendarioQuery("vista=año&fecha=ayer&mostrar=x&proyectos=no-id&evento=zzz&tarea=1", { today: TODAY, vista: "semana" });
    expect(q.vista).toBe("semana");
    expect(q.fecha).toBe(TODAY);
    expect(q.filters.mostrar).toBe("todo");
    expect(q.filters.proyectos).toEqual([]);
    expect(q.evento).toBeNull();
    expect(q.tarea).toBeNull();
  });

  it("ocultar follows the preference when the URL says nothing", () => {
    expect(parseCalendarioQuery("", { today: TODAY, ocultarCompletadas: true }).filters.ocultarCompletadas).toBe(true);
    expect(parseCalendarioQuery("ocultar=0", { today: TODAY, ocultarCompletadas: true }).filters.ocultarCompletadas).toBe(false);
  });

  it("responsable only counts with quien = todos", () => {
    expect(parseCalendarioQuery(`responsable=${ID}`, { today: TODAY }).filters.responsable).toBeNull();
  });
});

describe("toCalendarioSearch and calendarioHref", () => {
  const defaults = { today: TODAY, vista: "semana" as const };

  it("leaves defaults out", () => {
    const q = parseCalendarioQuery("", defaults);
    expect(toCalendarioSearch(q, defaults)).toBe("");
    expect(calendarioHref(q, defaults)).toBe("/calendario");
  });

  it("round-trips a query", () => {
    const search = `vista=mes&fecha=2026-12-01&mostrar=tareas&quien=todos&proyectos=${ID}&apoyo=0&ocultar=1&evento=t:${ID}`;
    const q = parseCalendarioQuery(search, defaults);
    expect(parseCalendarioQuery(toCalendarioSearch(q, defaults), defaults)).toEqual(q);
    expect(calendarioHref(q, defaults)).toMatch(/^\/calendario\?/);
  });
});

describe("normalizeCalendarioFilters", () => {
  it("sorts and de-duplicates ids and fills defaults", () => {
    expect(normalizeCalendarioFilters({ proyectos: [OTHER, ID, ID] }).proyectos).toEqual([ID, OTHER].sort());
    expect(normalizeCalendarioFilters()).toEqual(DEFAULT_CALENDARIO_FILTERS);
  });
});
