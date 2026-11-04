import { describe, expect, it } from "vitest";
import { isNavPathActive } from "./nav-active";

describe("isNavPathActive", () => {
  it("matches the href and its subpaths", () => {
    expect(isNavPathActive("/recursos", "/recursos")).toBe(true);
    expect(isNavPathActive("/recursos/mis-documentos", "/recursos")).toBe(true);
    expect(isNavPathActive("/recursosx", "/recursos")).toBe(false);
  });

  it("honors exact matching", () => {
    expect(isNavPathActive("/recursos/mis-documentos", "/recursos", { exact: true })).toBe(false);
    expect(isNavPathActive("/recursos", "/recursos", { exact: true })).toBe(true);
  });

  it("does not light up Recursos on company pages owned by Empresa", () => {
    const opts = { excludePrefixes: ["/recursos/empresa"] };
    expect(isNavPathActive("/recursos/empresa", "/recursos", opts)).toBe(false);
    expect(isNavPathActive("/recursos/empresa/book", "/recursos", opts)).toBe(false);
    expect(isNavPathActive("/recursos/empresa/rfc", "/recursos", opts)).toBe(false);
    expect(isNavPathActive("/recursos/formacion", "/recursos", opts)).toBe(true);
    expect(isNavPathActive("/recursos", "/recursos", opts)).toBe(true);
  });
});
