import { describe, expect, it } from "vitest";

import { legacyRedirectTarget } from "@/lib/ui/legacy-redirects";

describe("legacyRedirectTarget (FE §2.2)", () => {
  it.each([
    ["/", "/inicio"],
    ["/dashboard", "/inicio"],
    ["/tablero", "/tareas?estilo=visual"],
    ["/mis-tareas", "/tareas?estilo=analitico&responsable=yo"],
    ["/calendario", "/tareas"],
    ["/actividades/general", "/tareas?estilo=analitico"],
    ["/actividades/presale", "/tareas?estilo=analitico&tramo=presale"],
    ["/actividades/diseno", "/tareas?estilo=analitico&tramo=diseno"],
    ["/equipo", "/personas"],
    ["/directorio", "/personas/clientes"],
    ["/clientes", "/personas/clientes"],
    ["/contratistas", "/personas/contratistas"],
    ["/proveedores/colaboradores", "/personas/proveedores"],
    ["/proveedores/contratistas", "/personas/proveedores"],
    ["/proveedores/tiendas", "/personas/proveedores"],
    ["/recursos", "/biblioteca"],
    ["/recursos/formacion", "/biblioteca/formacion"],
    ["/recursos/formatos-obra", "/biblioteca/formatos-obra"],
    ["/recursos/plantillas-diseno", "/biblioteca/plantillas-diseno"],
    ["/recursos/mis-documentos", "/biblioteca/mis-documentos"],
    ["/recursos/mis-favoritos", "/biblioteca/mis-favoritos"],
    ["/recursos/mis-vacaciones", "/biblioteca/vacaciones"],
    ["/recursos/empresa", "/biblioteca"],
    ["/recursos/empresa/book", "/biblioteca/empresa/book"],
    ["/recursos/empresa/manual-de-la-empresa", "/biblioteca/empresa/manual-de-la-empresa"],
    ["/recursos/empresa/imagen-de-la-empresa", "/biblioteca/empresa/imagen-de-la-empresa"],
    ["/recursos/empresa/rfc", "/biblioteca/empresa/rfc"],
    ["/recursos/empresa/politicas-de-la-empresa", "/biblioteca/empresa/politicas-de-la-empresa"],
    ["/profile", "/ajustes/perfil"],
    ["/configuracion", "/ajustes/apariencia"],
    ["/configuracion/workflows", "/ajustes/tramos"],
    ["/configuracion/tramos", "/ajustes/tramos"],
    ["/configuracion/areas", "/ajustes/puestos"],
    ["/configuracion/puestos", "/ajustes/puestos"],
    ["/configuracion/importar-monday", "/ajustes/monday"],
    ["/configuracion/general", "/ajustes/general"],
    ["/configuracion/estatus", "/ajustes/estatus"],
    ["/configuracion/permisos", "/ajustes/permisos"],
    ["/configuracion/google", "/ajustes/google"],
    ["/configuracion/google/primeros-pasos", "/ajustes/google/primeros-pasos"],
  ])("maps %s to %s", (from, to) => {
    expect(legacyRedirectTarget(from)).toBe(to);
  });

  it("preserves the query string", () => {
    expect(legacyRedirectTarget("/dashboard", { tab: "kpis" })).toBe("/inicio?tab=kpis");
    expect(legacyRedirectTarget("/tablero", { proyecto: "p1", q: "piso" })).toBe(
      "/tareas?estilo=visual&proyecto=p1&q=piso",
    );
    expect(legacyRedirectTarget("/recursos/formacion", new URLSearchParams("carpeta=abc"))).toBe(
      "/biblioteca/formacion?carpeta=abc",
    );
  });

  it("keeps repeated keys and skips undefined values", () => {
    expect(legacyRedirectTarget("/equipo", { puesto: ["a", "b"], vacio: undefined })).toBe(
      "/personas?puesto=a&puesto=b",
    );
  });

  it("lets the target's own keys win over the old query", () => {
    expect(legacyRedirectTarget("/mis-tareas", { responsable: "otro", estado: "pendiente" })).toBe(
      "/tareas?estilo=analitico&responsable=yo&estado=pendiente",
    );
  });

  it("turns Project Flow's start deep link into the Tareas start sheet", () => {
    expect(legacyRedirectTarget("/actividades/presale", { project: "X" })).toBe(
      "/tareas?estilo=analitico&tramo=presale&project=X&iniciar=1",
    );
  });

  it("adds iniciar only with a project, and never twice", () => {
    expect(legacyRedirectTarget("/actividades/presale", { project: "" })).toBe(
      "/tareas?estilo=analitico&tramo=presale&project=",
    );
    expect(legacyRedirectTarget("/actividades/presale", { project: "X", iniciar: "1" })).toBe(
      "/tareas?estilo=analitico&tramo=presale&project=X&iniciar=1",
    );
    expect(legacyRedirectTarget("/actividades/general", { project: "X" })).toBe("/tareas?estilo=analitico&project=X");
  });

  it("tolerates trailing slashes and a query in the path", () => {
    expect(legacyRedirectTarget("/tablero/")).toBe("/tareas?estilo=visual");
    expect(legacyRedirectTarget("/actividades/presale?project=X")).toBe("/tareas?estilo=analitico&tramo=presale");
  });

  it("returns null for routes that are not legacy", () => {
    for (const path of [
      "/inicio",
      "/tareas",
      "/proyectos",
      "/proyectos/p1",
      "/asistente",
      "/login",
      "/portal",
      "/actividades",
      "/actividades/presale/extra",
      "/recursos/formacion/extra",
      "/configuracion/permisos/extra",
      "/proveedores",
      "/actividades/%E0%A4%A",
    ]) {
      expect(legacyRedirectTarget(path)).toBeNull();
    }
  });
});

describe("/tareas?vista= (the old view switch)", () => {
  it.each([
    ["vista=tablero", "/tareas?estilo=visual"],
    ["vista=lista", "/tareas?estilo=analitico"],
    ["vista=calendario", "/tareas"],
  ])("maps %s to %s", (search, to) => {
    expect(legacyRedirectTarget("/tareas", new URLSearchParams(search))).toBe(to);
  });

  it("keeps the filters and the task, in their order, and drops the Calendario params", () => {
    expect(legacyRedirectTarget("/tareas", { vista: "lista", tramo: "diseno", q: "piso", tarea: "t1" })).toBe(
      "/tareas?estilo=analitico&tramo=diseno&q=piso&tarea=t1",
    );
    expect(legacyRedirectTarget("/tareas", { vista: "calendario", cal: "semana", fecha: "2026-11-06", responsable: "yo" })).toBe(
      "/tareas?responsable=yo",
    );
  });

  it("lets an explicit estilo win and drops an unknown vista", () => {
    expect(legacyRedirectTarget("/tareas", { estilo: "esencial", vista: "tablero" })).toBe("/tareas?estilo=esencial");
    expect(legacyRedirectTarget("/tareas", { vista: "kanban", tramo: "diseno" })).toBe("/tareas?tramo=diseno");
  });

  it("leaves /tareas without vista alone", () => {
    expect(legacyRedirectTarget("/tareas")).toBeNull();
    expect(legacyRedirectTarget("/tareas", { estilo: "visual", tramo: "diseno" })).toBeNull();
  });

  it("drops the Calendario params from /calendario", () => {
    expect(legacyRedirectTarget("/calendario", { fecha: "2026-11-07", cal: "dia", tramo: "diseno" })).toBe("/tareas?tramo=diseno");
  });
});
