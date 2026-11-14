// @vitest-environment node
import { describe, expect, it } from "vitest";

import { redactForGithub, type RedactionContext } from "@/lib/soporte/redact";

const ctx: RedactionContext = {
  staffNames: ["Juan Pérez", "María López"],
  contactNames: ["Carlos Ruiz Mendoza"],
  clientNames: ["Constructora Horizonte"],
  projectNames: ["Casa del Lago"],
  appHosts: ["cincel-app.example.com"],
};

const redact = (text: string, context: RedactionContext = ctx) => redactForGithub(text, context).text;

describe("redactForGithub", () => {
  it("leaves clean text untouched and reports no change", () => {
    const result = redactForGithub("El botón Guardar no responde en Tareas.", ctx);
    expect(result).toEqual({ text: "El botón Guardar no responde en Tareas.", changed: false });
  });

  it("removes emails", () => {
    expect(redact("Escribe a juan.perez+obra@gmail.com o a ana@cincel.mx ya")).toBe("Escribe a [correo] o a [correo] ya");
  });

  it("removes phone numbers in common formats", () => {
    expect(redact("Llamar al +52 55 1234 5678")).toBe("Llamar al [teléfono]");
    expect(redact("Tel (55) 1234-5678.")).toBe("Tel [teléfono].");
    expect(redact("Cel 5512345678")).toBe("Cel [teléfono]");
  });

  it("keeps dates and short numbers", () => {
    expect(redact("Pasó el 2026-11-13 con 12 tareas y 3.5 horas")).toBe("Pasó el 2026-11-13 con 12 tareas y 3.5 horas");
  });

  it("replaces known staff and contact names, full and by first name", () => {
    expect(redact("Juan Pérez dijo que María López no lo ve")).toBe("[persona] dijo que [persona] no lo ve");
    expect(redact("Según Juan, falla")).toBe("Según [persona], falla");
    expect(redact("Habló con Carlos Ruiz Mendoza")).toBe("Habló con [persona]");
    expect(redact("habló con CARLOS")).toBe("habló con [persona]");
  });

  it("does not replace a name inside a longer word", () => {
    expect(redact("Juanita revisó el Juanes")).toBe("Juanita revisó el Juanes");
  });

  it("replaces client and project names", () => {
    expect(redact("En Casa del Lago, Constructora Horizonte pide cambios")).toBe("En [proyecto], [cliente] pide cambios");
  });

  it("prefers the client placeholder over the person words inside it", () => {
    const context = { ...ctx, staffNames: ["Horizonte Ríos"] };
    expect(redact("Constructora Horizonte y Horizonte Ríos", context)).toBe("[cliente] y [persona]");
  });

  it("keeps only the path of the app's own URLs and removes the rest", () => {
    expect(redact("Ver https://cincel-app.example.com/tareas?x=1.")).toBe("Ver /tareas.");
    expect(redact("Ver https://drive.google.com/file/d/abc y www.ejemplo.com/a, ok")).toBe("Ver [enlace] y [enlace], ok");
  });

  it("keeps relative app paths and masks ids", () => {
    expect(redact("Falla en /proyectos/3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab/tareas")).toBe("Falla en /proyectos/:id/tareas");
  });

  it("removes every foreign url when no app host is known", () => {
    const context = { ...ctx, appHosts: undefined };
    expect(redact("https://cincel-app.example.com/tareas", context)).toBe("[enlace]");
  });

  it("ignores empty and very short names", () => {
    const context: RedactionContext = { staffNames: ["Al", ""], contactNames: [], clientNames: [" "], projectNames: [] };
    expect(redact("Al final el cliente llegó", context)).toBe("Al final el cliente llegó");
  });

  it("escapes regex characters in names", () => {
    const context: RedactionContext = { staffNames: [], contactNames: [], clientNames: ["A+B (Sur)"], projectNames: [] };
    expect(redact("Obra de A+B (Sur) lista", context)).toBe("Obra de [cliente] lista");
  });

  it("marks the result as changed", () => {
    expect(redactForGithub("mail a x@y.com", ctx).changed).toBe(true);
  });
});
