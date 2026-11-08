// @vitest-environment node
import { describe, expect, it } from "vitest";

import { bibliotecaFixture, makeLink, resourcesCapabilities } from "@/components/biblioteca/biblioteca.fixtures";
import {
  BIBLIOTECA_SECTIONS,
  EMPRESA_DOCS,
  bibliotecaQuerySections,
  canViewBibliotecaSection,
  SECTION_TABLE_COLUMNS,
  buildBibliotecaGroups,
  documentToc,
  empresaDoc,
  empresaDocLinks,
  favoriteFor,
  filterSectionLinks,
  isBibliotecaSection,
  parseTipo,
  parseTramo,
  pickDocumentPart,
  resourceDownload,
  sectionTable,
  shortDate,
  visibleBibliotecaLinks,
} from "./catalog";

describe("biblioteca catalog", () => {
  it("serves the five sections of /biblioteca/[seccion] and none of empresa / mis-vacaciones", () => {
    for (const s of ["formacion", "formatos-obra", "plantillas-diseno", "mis-documentos", "mis-favoritos"]) {
      expect(isBibliotecaSection(s)).toBe(true);
    }
    expect(isBibliotecaSection("empresa")).toBe(false);
    expect(isBibliotecaSection("mis-vacaciones")).toBe(false);
    expect(isBibliotecaSection("vacaciones")).toBe(false);
  });

  it("lists the five company documents", () => {
    expect(EMPRESA_DOCS.map((d) => d.title)).toEqual([
      "Book",
      "Manual de la empresa",
      "Imagen de la empresa",
      "RFC",
      "Políticas de la empresa",
    ]);
  });

  it("keeps personal links only for their owner and Empresa only with access", () => {
    const links = [
      ...bibliotecaFixture(),
      makeLink({ id: "otro", section: "mis-documentos", personalFor: { id: "staff-luis", name: "Luis" } }),
      makeLink({ id: "sin-url", url: "  " }),
    ];
    const ana = visibleBibliotecaLinks(links, { id: "staff-ana", canViewEmpresa: true }).map((l) => l.id);
    expect(ana).toContain("mis-docs");
    expect(ana).not.toContain("otro");
    expect(ana).not.toContain("sin-url");
    expect(ana).toContain("manual-1");

    const luis = visibleBibliotecaLinks(links, { id: "staff-luis", canViewEmpresa: false }).map((l) => l.id);
    expect(luis).toContain("otro");
    expect(luis).not.toContain("mis-docs");
    expect(luis.some((id) => id.startsWith("manual"))).toBe(false);
  });

  it("maps Empresa links onto documents by template key or title, unclaimed links to the rest", () => {
    const links = bibliotecaFixture();
    expect(empresaDocLinks(links, "manual-de-la-empresa").map((l) => l.id)).toEqual(["manual-1", "manual-2"]);
    expect(empresaDocLinks(links, "rfc").map((l) => l.id)).toEqual(["rfc-1"]);
    // Nothing claims "book": it lists the Empresa links no document claims (none here).
    expect(empresaDocLinks(links, "book")).toEqual([]);

    const untagged = [makeLink({ id: "suelto", section: "empresa", title: "Organigrama" })];
    expect(empresaDocLinks(untagged, "book").map((l) => l.id)).toEqual(["suelto"]);
    expect(empresaDocLinks(untagged, "rfc").map((l) => l.id)).toEqual(["suelto"]);
  });

  it("builds the TOC without repeating the document name and picks ?parte=", () => {
    const parts = empresaDocLinks(bibliotecaFixture(), "manual-de-la-empresa");
    const toc = documentToc(parts, empresaDoc("manual-de-la-empresa")!);
    expect(toc).toEqual([
      { id: "manual-1", label: "Cómo trabajamos" },
      { id: "manual-2", label: "Cómo abrimos un proyecto" },
    ]);
    expect(pickDocumentPart(parts, "manual-2")?.id).toBe("manual-2");
    expect(pickDocumentPart(parts, "otro")?.id).toBe("manual-1");
    expect(pickDocumentPart([], undefined)).toBeNull();
  });

  it("builds the index cards with count and last update, and the Analítico catalog table", () => {
    const groups = buildBibliotecaGroups(bibliotecaFixture(), { showEmpresa: true });
    expect(groups.map((g) => g.title)).toEqual(["Empresa", "Recursos"]);
    const recursos = groups[1];
    expect(recursos.cards.map((c) => c.title)).toEqual([
      "Formación",
      "Formatos de obra",
      "Plantillas de diseño",
      "Mis documentos",
      "Mis favoritos",
      "Mis vacaciones",
    ]);
    const formatos = recursos.cards.find((c) => c.id === "formatos-obra")!;
    expect(formatos.meta).toEqual([
      { label: "Documentos", value: "3 documentos" },
      { label: "Actualizado", value: "act. 5 nov" },
    ]);
    expect(recursos.cards.find((c) => c.id === "mis-vacaciones")?.href).toBe("/biblioteca/vacaciones");
    expect(recursos.table.columns.map((c) => c.label)).toEqual(["Sección", "Documentos", "Actualizado"]);
    expect(recursos.table.rows.find((r) => r.id === "formatos-obra")?.documentos).toBe(3);

    expect(buildBibliotecaGroups(bibliotecaFixture(), { showEmpresa: false }).map((g) => g.key)).toEqual(["recursos"]);
  });

  it("filters the index by section name or document title", () => {
    const groups = buildBibliotecaGroups(bibliotecaFixture(), { showEmpresa: true, query: "bitacora" });
    expect(groups[0].cards).toEqual([]);
    expect(groups[1].cards.map((c) => c.id)).toEqual(["formatos-obra", "mis-favoritos"]);
  });

  it("filters a section by tipo, tramo and text", () => {
    const links = bibliotecaFixture();
    expect(filterSectionLinks(links, "formatos-obra", {}).map((l) => l.id)).toHaveLength(3);
    expect(filterSectionLinks(links, "formatos-obra", { tipo: "drive_folder" }).map((l) => l.id)).toEqual(["acta"]);
    expect(filterSectionLinks(links, "formatos-obra", { tramo: "construccion" }).map((l) => l.id).sort()).toEqual(["acta", "bitacora"]);
    expect(filterSectionLinks(links, "formatos-obra", { query: "levant" }).map((l) => l.id)).toEqual(["levantamiento"]);
    expect(parseTipo("web")).toBe("web");
    expect(parseTipo("otro")).toBeNull();
    expect(parseTramo(["diseno"])).toBe("diseno");
    expect(parseTramo("presale")).toBeNull();
  });

  it("finds the viewer's favorite of a row by Drive id or URL", () => {
    const links = bibliotecaFixture();
    const bitacora = links.find((l) => l.id === "bitacora")!;
    const acta = links.find((l) => l.id === "acta")!;
    expect(favoriteFor(bitacora, links)?.id).toBe("fav-bitacora");
    expect(favoriteFor(acta, links)).toBeNull();
    const fav = links.find((l) => l.id === "fav-bitacora")!;
    expect(favoriteFor(fav, links)?.id).toBe("fav-bitacora");
  });

  it("has no views / downloads columns in the section table (RD-7)", () => {
    const labels = SECTION_TABLE_COLUMNS.map((c) => c.label.toLowerCase());
    expect(labels).toEqual(["favorito", "nombre", "tipo", "tramo", "actualizado", "acciones"]);
    expect(labels.some((l) => /vistas|descargas/.test(l))).toBe(false);
    const table = sectionTable([bibliotecaFixture()[3]], new Set(["bitacora"]));
    expect(table.rows[0]).toMatchObject({ id: "bitacora", favorito: true, tipo: "Archivo", tramo: "Construcción" });
  });

  it("downloads Drive files through the app only with Drive configured, as the workspace", () => {
    const file = makeLink({ url: "https://docs.google.com/document/d/abc123/edit" });
    expect(resourceDownload(file, false)).toBeNull();
    expect(resourceDownload(file, true)).toEqual({ href: "/api/google/drive/file/abc123/content", label: "Descargar PDF" });
    expect(resourceDownload(makeLink({ linkType: "drive_folder", url: "https://drive.google.com/drive/folders/x" }), true)).toBeNull();
    expect(resourceDownload(makeLink({ linkType: "web", url: "https://example.com" }), true)).toBeNull();
  });

  it("formats dates in es-MX lower case without a period", () => {
    expect(shortDate("2026-11-04T16:00:00.000Z")).toBe("4 nov");
    expect(shortDate(null)).toBe("");
    expect(shortDate("nope")).toBe("");
  });
});

describe("biblioteca page-data sections", () => {
  const all = resourcesCapabilities();
  const noEmpresa = resourcesCapabilities({ canViewEmpresa: false });
  const noResources = { ...all, canViewResources: false };

  it("reads only the section plus the viewer's favorites for a Recursos section", () => {
    expect(bibliotecaQuerySections("formacion", all)).toEqual(["formacion", "mis-favoritos"]);
    expect(bibliotecaQuerySections("mis-favoritos", all)).toEqual(["mis-favoritos"]);
    expect(bibliotecaQuerySections("mis-vacaciones", all)).toEqual(["mis-vacaciones"]);
    expect(bibliotecaQuerySections("empresa", all)).toEqual(["empresa"]);
  });

  it("reads every visible section for the index, Empresa only with enterprise.canView", () => {
    expect(bibliotecaQuerySections(null, all)).toEqual([...BIBLIOTECA_SECTIONS, "empresa"]);
    expect(bibliotecaQuerySections(null, noEmpresa)).toEqual([...BIBLIOTECA_SECTIONS]);
    expect(bibliotecaQuerySections(null, noResources)).toEqual(["empresa"]);
    expect(bibliotecaQuerySections("formacion", noResources)).toEqual([]);
  });

  it("gates each section by its capability; Mis vacaciones is always readable", () => {
    expect(canViewBibliotecaSection(all, "formacion")).toBe(true);
    expect(canViewBibliotecaSection(noResources, "formacion")).toBe(false);
    expect(canViewBibliotecaSection(noEmpresa, "empresa")).toBe(false);
    expect(canViewBibliotecaSection(noResources, "mis-vacaciones")).toBe(true);
    expect(canViewBibliotecaSection({ ...noEmpresa, canViewResources: false }, null)).toBe(false);
  });
});
