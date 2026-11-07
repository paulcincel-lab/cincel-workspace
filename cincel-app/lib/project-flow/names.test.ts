import { describe, expect, it } from "vitest";

import { nameKey, stripMondayNumbering } from "./names";

describe("nameKey", () => {
  it("ignores case, accents and repeated spaces", () => {
    expect(nameKey("Ejecutivo")).toBe(nameKey("Ejécutivo"));
    expect(nameKey("  Proyecto   Arquitectónico ")).toBe("proyecto arquitectonico");
    expect(nameKey("PROYECTO ARQUITECTONICO")).toBe("proyecto arquitectonico");
    expect(nameKey("Diseño")).toBe("diseno");
    expect(nameKey("Depto\t201")).toBe("depto 201");
  });

  it("keeps different names apart", () => {
    expect(nameKey("Cobro")).not.toBe(nameKey("Cobros"));
    expect(nameKey("")).toBe("");
  });
});

describe("stripMondayNumbering", () => {
  it("removes monday numbering (brief examples)", () => {
    expect(stripMondayNumbering("1. Planos")).toBe("Planos");
    expect(stripMondayNumbering("01 - Fachadas")).toBe("Fachadas");
    expect(stripMondayNumbering("24, Renders")).toBe("Renders");
    expect(stripMondayNumbering("8.Producción")).toBe("Producción");
  });

  it("keeps titles whose number is part of the text", () => {
    expect(stripMondayNumbering("1.5 m de muro")).toBe("1.5 m de muro");
    expect(stripMondayNumbering("1.5 m")).toBe("1.5 m");
    expect(stripMondayNumbering("3 recámaras")).toBe("3 recámaras");
    expect(stripMondayNumbering("2024 Plan")).toBe("2024 Plan");
  });

  it("keeps a title that would become empty, and plain titles", () => {
    expect(stripMondayNumbering("1.")).toBe("1.");
    expect(stripMondayNumbering("12 - ")).toBe("12 - ");
    expect(stripMondayNumbering("Planos")).toBe("Planos");
  });
});
