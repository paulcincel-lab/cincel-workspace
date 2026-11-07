import { describe, expect, it } from "vitest";

import { legacyRedirectTarget } from "@/lib/ui/legacy-redirects";

describe("legacyRedirectTarget (FE §2.2)", () => {
  it.each([
    ["/", "/inicio"],
    ["/dashboard", "/inicio"],
    ["/tablero", "/tareas?vista=tablero"],
    ["/mis-tareas", "/tareas?vista=lista&responsable=yo"],
    ["/calendario", "/tareas?vista=calendario"],
    ["/actividades/general", "/tareas?vista=lista"],
    ["/actividades/presale", "/tareas?vista=lista&tramo=presale"],
    ["/actividades/diseno", "/tareas?vista=lista&tramo=diseno"],
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
      "/tareas?vista=tablero&proyecto=p1&q=piso",
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
      "/tareas?vista=lista&responsable=yo&estado=pendiente",
    );
  });

  it("turns Project Flow's start deep link into the Tareas start sheet", () => {
    expect(legacyRedirectTarget("/actividades/presale", { project: "X" })).toBe(
      "/tareas?vista=lista&tramo=presale&project=X&iniciar=1",
    );
  });

  it("adds iniciar only with a project, and never twice", () => {
    expect(legacyRedirectTarget("/actividades/presale", { project: "" })).toBe(
      "/tareas?vista=lista&tramo=presale&project=",
    );
    expect(legacyRedirectTarget("/actividades/presale", { project: "X", iniciar: "1" })).toBe(
      "/tareas?vista=lista&tramo=presale&project=X&iniciar=1",
    );
    expect(legacyRedirectTarget("/actividades/general", { project: "X" })).toBe("/tareas?vista=lista&project=X");
  });

  it("tolerates trailing slashes and a query in the path", () => {
    expect(legacyRedirectTarget("/tablero/")).toBe("/tareas?vista=tablero");
    expect(legacyRedirectTarget("/actividades/presale?project=X")).toBe("/tareas?vista=lista&tramo=presale");
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
