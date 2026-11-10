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
  buildBibliotecaOverview,
  documentBadge,
  nextVacation,
  relativeOpened,
  vacationRange,
} from "./catalog";
import {
  GENERAL_PROJECT_LABEL,
  buildBibliotecaTable,
  documentTipo,
  parseBibliotecaIndexFilters,
  type BibliotecaIndexFilters,
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

describe("biblioteca overview", () => {
  const NOW = new Date("2026-11-09T18:00:00.000Z");

  it("buildBibliotecaOverview counts per section and total", () => {
    const overview = buildBibliotecaOverview(bibliotecaFixture(), { showEmpresa: true, now: NOW });
    expect(overview.sections.map((s) => s.key)).toEqual([
      "plantillas-diseno",
      "formatos-obra",
      "formacion",
      "empresa",
      "mis-documentos",
      "mis-vacaciones",
    ]);
    const count = Object.fromEntries(overview.sections.map((s) => [s.key, s.count]));
    expect(count).toEqual({
      "plantillas-diseno": 0,
      "formatos-obra": 3,
      formacion: 0,
      empresa: 3,
      "mis-documentos": 1,
      "mis-vacaciones": 0,
    });
    // The donut covers the colored sections only (Mis vacaciones is neutral).
    expect(overview.total).toBe(7);
    expect(overview.favoritesCount).toBe(1);
    const formatos = overview.sections.find((s) => s.key === "formatos-obra")!;
    expect(formatos.updatedAt).toBe("2026-11-05T16:00:00.000Z");
    expect(formatos.color).toBe(2);
    expect(formatos.href).toBe("/biblioteca/formatos-obra");
  });

  it("buildBibliotecaOverview newCount uses createdAt within 7 days", () => {
    const links = [
      makeLink({ section: "plantillas-diseno", createdAt: "2026-11-08T16:00:00.000Z" }),
      makeLink({ section: "plantillas-diseno", createdAt: "2026-11-03T16:00:00.000Z" }),
      makeLink({ section: "plantillas-diseno", createdAt: "2026-10-30T16:00:00.000Z", updatedAt: "2026-11-09T10:00:00.000Z" }),
    ];
    const overview = buildBibliotecaOverview(links, { showEmpresa: false, now: NOW });
    const plantillas = overview.sections.find((s) => s.key === "plantillas-diseno")!;
    expect(plantillas.count).toBe(3);
    expect(plantillas.newCount).toBe(2);
    expect(overview.newThisWeek).toBe(2);
  });

  it("buildBibliotecaOverview empresa is null without showEmpresa", () => {
    const overview = buildBibliotecaOverview(bibliotecaFixture(), { showEmpresa: false, now: NOW });
    expect(overview.empresa).toBeNull();
    expect(overview.manualHighlight).toBeNull();
    expect(overview.sections.some((s) => s.key === "empresa")).toBe(false);

    const withEmpresa = buildBibliotecaOverview(bibliotecaFixture(), { showEmpresa: true, now: NOW });
    expect(withEmpresa.empresa?.map((d) => [d.slug, d.count])).toEqual([
      ["book", 0],
      ["manual-de-la-empresa", 2],
      ["imagen-de-la-empresa", 0],
      ["rfc", 1],
      ["politicas-de-la-empresa", 0],
    ]);
  });

  it("buildBibliotecaOverview manualHighlight is the newest manual part within 14 days", () => {
    const links = [
      makeLink({ id: "m-old", section: "empresa", title: "Manual de la empresa · Viejo", createdAt: "2026-10-01T16:00:00.000Z" }),
      makeLink({ id: "m-a", section: "empresa", title: "Manual de la empresa · Seguridad en obra", createdAt: "2026-11-01T16:00:00.000Z" }),
      makeLink({ id: "m-b", section: "empresa", title: "Manual de la empresa · Cierre de proyecto", createdAt: "2026-11-06T16:00:00.000Z" }),
    ];
    const overview = buildBibliotecaOverview(links, { showEmpresa: true, now: NOW });
    expect(overview.manualHighlight).toEqual({
      title: "Cierre de proyecto",
      href: "/biblioteca/empresa/manual-de-la-empresa?parte=m-b",
    });
    const stale = buildBibliotecaOverview([links[0]], { showEmpresa: true, now: NOW });
    expect(stale.manualHighlight).toBeNull();
  });

  it("buildBibliotecaOverview query filters sections", () => {
    const overview = buildBibliotecaOverview(bibliotecaFixture(), { showEmpresa: true, query: "BITACORA", now: NOW });
    expect(overview.sections.map((s) => s.key)).toEqual(["formatos-obra"]);
    expect(buildBibliotecaOverview(bibliotecaFixture(), { showEmpresa: true, query: "zzz", now: NOW }).sections).toEqual([]);
  });

  it("buildBibliotecaOverview without Recursos keeps Empresa and Mis vacaciones", () => {
    const overview = buildBibliotecaOverview([], { showEmpresa: true, showRecursos: false, now: NOW });
    expect(overview.sections.map((s) => s.key)).toEqual(["empresa", "mis-vacaciones"]);
  });

  it("documentBadge maps extension, mime and link type", () => {
    const drive = (fileName: string | null, mimeType: string | null) => ({
      id: "d",
      googleFileId: "g",
      fileName,
      mimeType,
      iconLink: null,
      thumbnailLink: null,
      webViewLink: null,
      syncedAt: null,
    });
    const file = { linkType: "drive_file" as const, url: "https://drive.google.com/file/d/abc/view" };
    expect(documentBadge({ ...file, drive: drive("Planta baja.DWG", null) })).toBe("DWG");
    expect(documentBadge({ ...file, drive: drive("Acta.pdf", "application/octet-stream") })).toBe("PDF");
    expect(documentBadge({ ...file, drive: drive("Presupuesto", "application/vnd.google-apps.spreadsheet") })).toBe("XLSX");
    expect(documentBadge({ ...file, drive: drive(null, "image/png") })).toBe("PNG");
    expect(documentBadge({ ...file, drive: null })).toBe("Archivo");
    expect(documentBadge({ linkType: "drive_file", url: "https://docs.google.com/document/d/x/edit", drive: null })).toBe("DOC");
    expect(documentBadge({ linkType: "drive_folder", url: "https://drive.google.com/drive/folders/x", drive: null })).toBe("Carpeta");
    expect(documentBadge({ linkType: "web", url: "https://cincel.mx/manual", drive: null })).toBe("Enlace");
  });

  it("relativeOpened returns hace min / h / ayer / short date", () => {
    expect(relativeOpened("2026-11-09T17:55:00.000Z", NOW)).toBe("hace 5 min");
    expect(relativeOpened("2026-11-09T17:59:50.000Z", NOW)).toBe("hace 1 min");
    expect(relativeOpened("2026-11-09T16:00:00.000Z", NOW)).toBe("hace 2 h");
    expect(relativeOpened("2026-11-08T15:00:00.000Z", NOW)).toBe("ayer");
    expect(relativeOpened("2026-11-06T18:00:00.000Z", NOW)).toBe("6 nov");
  });

  it("nextVacation picks the next approved request", () => {
    const balance = { entitled: 12, taken: 0, pending: 0, available: 12 };
    const request = (id: string, from: string, to: string, status: "aprobada" | "pendiente" | "rechazada" | "cancelada") => ({
      id,
      from,
      to,
      kind: "vacaciones" as const,
      comment: "",
      status,
    });
    const mine = {
      balance,
      requests: [
        request("past", "2026-08-03", "2026-08-07", "aprobada"),
        request("dec", "2026-12-22", "2026-12-26", "aprobada"),
        request("pending", "2026-11-16", "2026-11-17", "pendiente"),
        request("nov", "2026-11-20", "2026-11-20", "aprobada"),
      ],
    };
    expect(nextVacation(mine, "2026-11-09")).toEqual({ available: 12, next: { from: "2026-11-20", to: "2026-11-20" } });
    expect(nextVacation({ balance, requests: [mine.requests[0]] }, "2026-11-09")).toEqual({ available: 12, next: null });
    expect(nextVacation(null, "2026-11-09")).toBeNull();
  });

  it("vacationRange formats same and cross month", () => {
    expect(vacationRange("2026-12-22", "2026-12-26")).toBe("22–26 dic");
    expect(vacationRange("2026-12-28", "2027-01-03")).toBe("28 dic–3 ene");
    expect(vacationRange("2026-11-20", "2026-11-20")).toBe("20 nov");
  });
});

// ── Analítico index (#1006) ─────────────────────────────────────────────────

describe("Biblioteca Analítico table", () => {
  const NOW = new Date("2026-11-09T18:00:00.000Z");
  const DAY = 24 * 60 * 60 * 1000;
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
  const ALL: BibliotecaIndexFilters = { mostrar: "todos", clase: "todos", favoritos: false, q: "", abiertos: [] };
  const torre = { id: "p-torre", name: "Torre Reforma" };
  const casa = { id: "p-casa", name: "Casa Valle" };

  it("parseBibliotecaIndexFilters defaults and invalid values", () => {
    expect(parseBibliotecaIndexFilters(new URLSearchParams())).toEqual(ALL);
    expect(parseBibliotecaIndexFilters(new URLSearchParams("mostrar=nada&clase=tipo&favoritos=si"))).toEqual(ALL);
    expect(
      parseBibliotecaIndexFilters(new URLSearchParams("mostrar=sin-actualizar&clase=hoja&favoritos=1&q=acta&abiertos=formatos-obra,empresa,,empresa")),
    ).toEqual({ mostrar: "sin-actualizar", clase: "hoja", favoritos: true, q: "acta", abiertos: ["formatos-obra", "empresa"] });
  });

  it("documentTipo rules", () => {
    const drive = (mimeType: string | null, fileName: string | null = null) => ({
      id: "d",
      googleFileId: "g",
      fileName,
      mimeType,
      iconLink: null,
      thumbnailLink: null,
      webViewLink: null,
      syncedAt: null,
    });
    expect(documentTipo(makeLink({ section: "plantillas-diseno" }))).toBe("Plantilla");
    expect(documentTipo(makeLink({ section: "formatos-obra", templateKey: "bitacora" }))).toBe("Plantilla");
    expect(documentTipo(makeLink({ section: "empresa", templateKey: "rfc", drive: drive("application/pdf") }))).toBe("PDF");
    expect(documentTipo(makeLink({ drive: drive("application/pdf") }))).toBe("PDF");
    expect(documentTipo(makeLink({ drive: drive("application/vnd.google-apps.spreadsheet") }))).toBe("Hoja");
    expect(documentTipo(makeLink({ drive: drive(null, "Presupuesto.xlsx") }))).toBe("Hoja");
    expect(documentTipo(makeLink({ url: "https://docs.google.com/spreadsheets/d/abc/edit" }))).toBe("Hoja");
    expect(documentTipo(makeLink({ drive: drive("video/mp4") }))).toBe("Video");
    expect(documentTipo(makeLink({ linkType: "drive_folder", url: "https://drive.google.com/drive/folders/x" }))).toBe("Carpeta");
    expect(documentTipo(makeLink({ linkType: "web", url: "https://www.dof.gob.mx/nota" }))).toBe("Enlace");
    expect(documentTipo(makeLink({ drive: drive("application/vnd.google-apps.document") }))).toBe("Documento");
  });

  it("buildBibliotecaTable groups by section then project", () => {
    const links = [
      makeLink({ id: "a", section: "formatos-obra", title: "Bitácora", project: torre, updatedAt: daysAgo(1) }),
      makeLink({ id: "b", section: "formatos-obra", title: "Acta", project: casa, updatedAt: daysAgo(2) }),
      makeLink({ id: "c", section: "formatos-obra", title: "Checklist", project: null, updatedAt: daysAgo(3) }),
      ...[4, 5, 6, 7].map((n) => makeLink({ id: `t${n}`, section: "formatos-obra", title: `Torre ${n}`, project: torre, updatedAt: daysAgo(n) })),
      makeLink({ id: "f", section: "formacion", title: "Curso", updatedAt: daysAgo(5) }),
    ];
    const table = buildBibliotecaTable(links, ALL, { showEmpresa: false, now: NOW, usage: null });

    expect(table.groups.map((g) => g.id)).toEqual(["formatos-obra", "plantillas-diseno", "formacion", "mis-documentos"]);
    const formatos = table.groups[0];
    expect(formatos.label).toBe("Formatos de obra");
    expect(formatos.caption).toBe("7 documentos · 3 grupos");
    expect(formatos.children!.map((c) => c.label)).toEqual([GENERAL_PROJECT_LABEL, "Casa Valle", "Torre Reforma"]);

    const torreGroup = formatos.children!.find((c) => c.label === "Torre Reforma")!;
    expect(torreGroup.caption).toBe("5 documentos");
    expect(torreGroup.rows!.map((r) => r.id)).toEqual(["a", "t4", "t5"]);
    expect(table.targets[torreGroup.id]).toMatchObject({ section: "formatos-obra", projectId: "p-torre", moreCount: 2, moreHref: "/biblioteca/formatos-obra" });

    expect(table.groups.find((g) => g.id === "plantillas-diseno")!.caption).toBe("0 documentos");
    expect(table.nonEmpty).toEqual(["formatos-obra", "formacion"]);
    expect(formatos.footer).toMatchObject({ nombre: "Total · 7 documentos" });
  });

  it("buildBibliotecaTable empresa groups by company doc", () => {
    const table = buildBibliotecaTable(bibliotecaFixture(), ALL, { showEmpresa: true, now: NOW, usage: null });
    const empresa = table.groups[0];
    expect(empresa.id).toBe("empresa");
    expect(empresa.label).toBe("La empresa");
    expect(empresa.children!.map((c) => c.label)).toEqual(EMPRESA_DOCS.map((doc) => doc.title));
    expect(empresa.caption).toContain("· 5 secciones");
    const manual = empresa.children!.find((c) => c.id === "empresa:manual-de-la-empresa")!;
    expect(manual.rows!.map((r) => r.href)).toEqual(
      expect.arrayContaining(["/biblioteca/empresa/manual-de-la-empresa?parte=manual-1", "/biblioteca/empresa/manual-de-la-empresa?parte=manual-2"]),
    );
    const rfc = empresa.children!.find((c) => c.id === "empresa:rfc")!;
    expect(rfc.rows!.map((r) => r.id)).toEqual(["rfc-1"]);
    expect(table.targets["empresa:rfc"]).toMatchObject({ section: "empresa", templateKey: "rfc" });

    const hidden = buildBibliotecaTable(bibliotecaFixture(), ALL, { showEmpresa: false, now: NOW, usage: null });
    expect(hidden.groups.some((g) => g.id === "empresa")).toBe(false);
  });

  it("buildBibliotecaTable stale at 181 d not at 180 d", () => {
    const links = [
      makeLink({ id: "d180", updatedAt: daysAgo(180) }),
      makeLink({ id: "d181", updatedAt: daysAgo(181) }),
      makeLink({ id: "d30", updatedAt: daysAgo(30) }),
      makeLink({ id: "d31", updatedAt: daysAgo(31) }),
    ];
    const table = buildBibliotecaTable(links, ALL, { showEmpresa: false, now: NOW, usage: null });
    // A group lists its newest BIBLIOTECA_GROUP_ROWS rows: the boundary pair alone.
    const pair = buildBibliotecaTable(links.slice(0, 2), ALL, { showEmpresa: false, now: NOW, usage: null });
    const rows = pair.groups.flatMap((g) => g.children ?? []).flatMap((c) => c.rows ?? []);
    expect(rows.find((r) => r.id === "d180")!.stale).toBe(false);
    expect(rows.find((r) => r.id === "d181")!.stale).toBe(true);
    expect(table.kpis.sinActualizar).toBe(1);
    expect(table.kpis.actualizados30).toBe(1);
    const recent = buildBibliotecaTable(links, { ...ALL, mostrar: "actualizados" }, { showEmpresa: false, now: NOW, usage: null });
    expect(recent.kpis.documentos).toBe(1);
  });

  it("buildBibliotecaTable counts per filter option", () => {
    const pdf = { id: "d", googleFileId: "g", fileName: "x.pdf", mimeType: "application/pdf", iconLink: null, thumbnailLink: null, webViewLink: null, syncedAt: null };
    const links = [
      ...bibliotecaFixture(),
      makeLink({ id: "viejo", section: "formacion", title: "Norma vieja", drive: pdf, updatedAt: daysAgo(400) }),
      makeLink({ id: "plantilla", section: "plantillas-diseno", title: "Carátula", updatedAt: daysAgo(2) }),
    ];
    const table = buildBibliotecaTable(links, ALL, { showEmpresa: true, now: NOW, usage: null });
    // Favorites are copies: the universe is Empresa + the four Recursos sections.
    expect(table.counts["mostrar:todos"]).toBe(table.kpis.documentos);
    expect(table.counts["mostrar:sin-actualizar"]).toBe(1);
    expect(table.counts["clase:pdf"]).toBe(1);
    expect(table.counts["clase:plantilla"]).toBe(1);
    expect(table.counts["favoritos:1"]).toBe(1);

    // Filters combine (AND) and the other groups' counts follow.
    const pdfOnly = buildBibliotecaTable(links, { ...ALL, clase: "pdf" }, { showEmpresa: true, now: NOW, usage: null });
    expect(pdfOnly.kpis.documentos).toBe(1);
    expect(pdfOnly.counts["mostrar:sin-actualizar"]).toBe(1);
    expect(pdfOnly.counts["mostrar:actualizados"]).toBe(0);
    const both = buildBibliotecaTable(links, { ...ALL, clase: "pdf", favoritos: true }, { showEmpresa: true, now: NOW, usage: null });
    expect(both.kpis.documentos).toBe(0);
  });

  it("buildBibliotecaTable secciones counts non-empty containers", () => {
    const table = buildBibliotecaTable(bibliotecaFixture(), ALL, { showEmpresa: true, now: NOW, usage: null });
    // Empresa: the Manual and RFC have parts (Book, Imagen and Políticas don't), plus Formatos de obra and Mis documentos.
    expect(table.kpis.secciones).toBe(4);
    expect(table.totals.secciones).toBe(4);
    const recursos = buildBibliotecaTable(bibliotecaFixture(), ALL, { showEmpresa: false, now: NOW, usage: null });
    expect(recursos.kpis.secciones).toBe(2);
  });

  it("buildBibliotecaTable usage null omits opens", () => {
    const without = buildBibliotecaTable(bibliotecaFixture(), ALL, { showEmpresa: true, now: NOW, usage: null });
    expect(without.columns.map((c) => c.label)).not.toContain("Aperturas 30 d");
    expect(without.kpis.abiertosSemana).toBeNull();
    expect(without.totals.opens30d).toBeNull();
    expect(without.groups.flatMap((g) => g.metrics.map((m) => m.key))).not.toContain("aperturas");
    expect(without.groups.flatMap((g) => g.children ?? []).flatMap((c) => c.rows ?? []).every((r) => r.opens30d === null)).toBe(true);

    const usage = { byLink: { bitacora: { opens30d: 7, mine30d: 2 }, acta: { opens30d: 3, mine30d: 0 } }, opensThisWeek: 4 };
    const withUsage = buildBibliotecaTable(bibliotecaFixture(), ALL, { showEmpresa: true, now: NOW, usage });
    expect(withUsage.columns.map((c) => c.label)).toContain("Aperturas 30 d");
    expect(withUsage.kpis.abiertosSemana).toBe(4);
    expect(withUsage.totals.opens30d).toBe(10);
    const formatos = withUsage.groups.find((g) => g.id === "formatos-obra")!;
    expect(formatos.metrics.find((m) => m.key === "aperturas")?.value).toBe("10");
  });
});
