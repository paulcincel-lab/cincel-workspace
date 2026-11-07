import { describe, expect, it } from "vitest";

import {
  isNotFoundSearchAvailable,
  loadingVariantFor,
  NOT_FOUND_COPY,
  notFoundHomeHref,
  OFFLINE_COPY,
  ROUTE_ERROR_TITLE,
} from "./route-states";

describe("route states copy", () => {
  it("uses the FE §3.12 / §4.2 copy", () => {
    expect(NOT_FOUND_COPY.title).toBe("No encontramos esta página");
    expect(NOT_FOUND_COPY.home).toBe("Volver a Inicio");
    expect(NOT_FOUND_COPY.search).toBe("Buscar");
    expect(ROUTE_ERROR_TITLE).toBe("No se pudo cargar esta página.");
    expect(OFFLINE_COPY).toBe("Sin conexión. Los cambios se guardarán cuando vuelvas a estar en línea.");
  });
});

describe("notFoundHomeHref", () => {
  it("goes to /inicio with the redesign on and /dashboard with it off", () => {
    expect(notFoundHomeHref(true)).toBe("/inicio");
    expect(notFoundHomeHref(false)).toBe("/dashboard");
  });
});

describe("isNotFoundSearchAvailable", () => {
  it("needs both the redesign and an implemented search action", () => {
    expect(isNotFoundSearchAvailable(true, { searchWorkspaceAction: true })).toBe(true);
    expect(isNotFoundSearchAvailable(true, { searchWorkspaceAction: false })).toBe(false);
    expect(isNotFoundSearchAvailable(false, { searchWorkspaceAction: true })).toBe(false);
    expect(isNotFoundSearchAvailable(false, { searchWorkspaceAction: false })).toBe(false);
  });
});

describe("loadingVariantFor", () => {
  it.each([
    ["/", "kpis"],
    ["/inicio", "kpis"],
    ["/dashboard", "kpis"],
    ["/mi-espacio", "cards"],
    ["/tareas", "list"],
    ["/tareas?vista=tablero", "list"],
    ["/mis-tareas", "list"],
    ["/actividades/diseno", "list"],
    ["/tablero", "board"],
    ["/calendario", "calendar"],
    ["/proyectos", "cards"],
    ["/proyectos/abc", "kpis"],
    ["/proyectos/abc/tareas", "list"],
    ["/proyectos/abc/cronograma", "table"],
    ["/proyectos/abc/cronograma/reporte", "table"],
    ["/proyectos/abc/archivos", "table"],
    ["/proyectos/abc/ficha", "list"],
    ["/personas", "cards"],
    ["/personas/clientes", "table"],
    ["/personas/contratistas", "table"],
    ["/personas/proveedores", "table"],
    ["/personas/equipo/abc", "kpis"],
    ["/equipo", "cards"],
    ["/directorio", "table"],
    ["/biblioteca", "cards"],
    ["/biblioteca/formacion", "cards"],
    ["/biblioteca/vacaciones", "list"],
    ["/recursos", "cards"],
    ["/ajustes/apariencia", "list"],
    ["/configuracion/estatus", "list"],
    ["/asistente", "list"],
    ["/algo-desconocido", "list"],
  ] as const)("%s → %s", (pathname, variant) => {
    expect(loadingVariantFor(pathname)).toBe(variant);
  });

  it("treats a missing pathname as the home page", () => {
    expect(loadingVariantFor(null)).toBe("kpis");
    expect(loadingVariantFor(undefined)).toBe("kpis");
  });
});
