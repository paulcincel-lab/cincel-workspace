/**
 * Biblioteca catalog (redesign FE §3.7): the Empresa documents and Recursos
 * sections, how resource links map onto them, and the widget data the index,
 * sección and documento screens render. Pure and client-safe; the pages load
 * the links with the existing resource actions.
 */
import { canPreviewInline, driveContentUrl, getDriveId, hasDriveUrl } from "@/lib/google/drive-url";
import type { ResourceAppliesTo, ResourceLink, ResourceLinkType, ResourceSection } from "@/lib/types/resource";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { EntityCard, RecordTableData } from "@/lib/types/widgets";

// ── Catalog ─────────────────────────────────────────────────────────────────

export type EmpresaDocSlug = "book" | "manual-de-la-empresa" | "imagen-de-la-empresa" | "rfc" | "politicas-de-la-empresa";

export type EmpresaDoc = { slug: EmpresaDocSlug; title: string; description: string; iconName: string };

export const EMPRESA_DOCS: readonly EmpresaDoc[] = [
  { slug: "book", title: "Book", description: "Portafolio de proyectos terminados para clientes.", iconName: "book-open" },
  { slug: "manual-de-la-empresa", title: "Manual de la empresa", description: "Procesos, roles y cómo trabajamos.", iconName: "book-marked" },
  { slug: "imagen-de-la-empresa", title: "Imagen de la empresa", description: "Logotipos, tipografías y plantillas de marca.", iconName: "palette" },
  { slug: "rfc", title: "RFC", description: "Datos fiscales y constancias vigentes.", iconName: "landmark" },
  { slug: "politicas-de-la-empresa", title: "Políticas de la empresa", description: "Vacaciones, horarios, gastos y seguridad en obra.", iconName: "scroll-text" },
];

/** The sections served by `/biblioteca/[seccion]` (Mis vacaciones has its own page). */
export type BibliotecaSectionSlug = Exclude<ResourceSection, "empresa" | "mis-vacaciones">;

export type BibliotecaRecurso = {
  section: Exclude<ResourceSection, "empresa">;
  title: string;
  description: string;
  iconName: string;
  href: string;
};

export const BIBLIOTECA_RECURSOS: readonly BibliotecaRecurso[] = [
  { section: "formacion", title: "Formación", description: "Cursos internos y grabaciones de capacitaciones.", iconName: "graduation-cap", href: "/biblioteca/formacion" },
  { section: "formatos-obra", title: "Formatos de obra", description: "Bitácoras, actas, checklists y estimaciones.", iconName: "clipboard-list", href: "/biblioteca/formatos-obra" },
  { section: "plantillas-diseno", title: "Plantillas de diseño", description: "Láminas, carátulas y planos tipo.", iconName: "pencil-ruler", href: "/biblioteca/plantillas-diseno" },
  { section: "mis-documentos", title: "Mis documentos", description: "Tus archivos personales y contratos.", iconName: "folder", href: "/biblioteca/mis-documentos" },
  { section: "mis-favoritos", title: "Mis favoritos", description: "Lo que marcaste con estrella.", iconName: "star", href: "/biblioteca/mis-favoritos" },
  { section: "mis-vacaciones", title: "Mis vacaciones", description: "Saldo de días y solicitudes.", iconName: "calendar-days", href: "/biblioteca/vacaciones" },
];

const SECTION_SLUGS: ReadonlySet<string> = new Set<BibliotecaSectionSlug>([
  "formacion",
  "formatos-obra",
  "plantillas-diseno",
  "mis-documentos",
  "mis-favoritos",
]);

export function isBibliotecaSection(value: string): value is BibliotecaSectionSlug {
  return SECTION_SLUGS.has(value);
}

export function empresaDoc(slug: string): EmpresaDoc | null {
  return EMPRESA_DOCS.find((doc) => doc.slug === slug) ?? null;
}

export function recurso(section: ResourceSection): BibliotecaRecurso | null {
  return BIBLIOTECA_RECURSOS.find((item) => item.section === section) ?? null;
}

export function empresaDocHref(slug: EmpresaDocSlug, linkId?: string): string {
  return linkId ? `/biblioteca/empresa/${slug}?parte=${encodeURIComponent(linkId)}` : `/biblioteca/empresa/${slug}`;
}

// ── Visibility (server side) ────────────────────────────────────────────────

/**
 * The links a viewer sees in the Biblioteca: links with a URL (as the Recursos
 * workspace), personal links only for the person they belong to, and Empresa
 * only with `enterprise.canView`. Pages run this on the server.
 */
export function visibleBibliotecaLinks(
  links: ResourceLink[],
  viewer: { id: string | null; canViewEmpresa: boolean },
): ResourceLink[] {
  return links.filter((link) => {
    if (!hasDriveUrl(link.url)) return false;
    if (link.section === "empresa") return viewer.canViewEmpresa;
    if (!link.personalFor) return true;
    return viewer.id !== null && link.personalFor.id === viewer.id;
  });
}

// ── Empresa documents ───────────────────────────────────────────────────────

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesDoc(link: ResourceLink, doc: EmpresaDoc): boolean {
  if (link.templateKey === doc.slug) return true;
  const title = normalize(link.title);
  const label = normalize(doc.title);
  return title === label || title.startsWith(`${label} `);
}

function byOrder(a: ResourceLink, b: ResourceLink): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.title.localeCompare(b.title, "es-MX");
}

/**
 * The Empresa links of one company document: those whose template key is the
 * document's slug or whose title starts with its name. A document with none of
 * its own lists the Empresa links no document claims, so an Empresa section
 * that was never split per document shows everything, as `/recursos/empresa/*`
 * always did.
 */
export function empresaDocLinks(links: ResourceLink[], slug: EmpresaDocSlug): ResourceLink[] {
  const empresa = links.filter((link) => link.section === "empresa");
  const doc = empresaDoc(slug);
  if (!doc) return [];
  const own = empresa.filter((link) => matchesDoc(link, doc));
  if (own.length > 0) return own.sort(byOrder);
  return empresa.filter((link) => !EMPRESA_DOCS.some((other) => matchesDoc(link, other))).sort(byOrder);
}

export type DocumentTocEntry = { id: string; label: string };

/** TOC of a company document: one entry per part (resource link), in order. */
export function documentToc(parts: ResourceLink[], doc: EmpresaDoc): DocumentTocEntry[] {
  const prefix = normalize(doc.title);
  return parts.map((part) => {
    const title = part.title.trim();
    const normalized = normalize(title);
    // "Manual de la empresa · Cómo trabajamos" → "Cómo trabajamos".
    const label =
      normalized.startsWith(`${prefix} `) && title.length > doc.title.length
        ? title.slice(doc.title.length).replace(/^[\s·:–—-]+/, "") || title
        : title;
    return { id: part.id, label };
  });
}

/** The part to show: `?parte=` when it belongs to the document, else the first one. */
export function pickDocumentPart(parts: ResourceLink[], parte: string | null | undefined): ResourceLink | null {
  return parts.find((part) => part.id === parte) ?? parts[0] ?? null;
}

// ── Dates ───────────────────────────────────────────────────────────────────

const SHORT_DATE = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" });

/** "4 nov" (es-MX, lower case, no period). Empty for an invalid date. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return SHORT_DATE.format(date).replace(/\./g, "").toLowerCase();
}

function latest(links: ResourceLink[]): string | null {
  let max: string | null = null;
  for (const link of links) {
    if (!max || link.updatedAt > max) max = link.updatedAt;
  }
  return max;
}

// ── Index ───────────────────────────────────────────────────────────────────

export type BibliotecaGroup = { key: "empresa" | "recursos"; title: string; caption: string; cards: EntityCard[]; table: RecordTableData };

function documentsLabel(count: number): string {
  return `${count} ${count === 1 ? "documento" : "documentos"}`;
}

function card(id: string, title: string, description: string, iconName: string, href: string, links: ResourceLink[]): EntityCard {
  const updated = latest(links);
  return {
    id,
    title,
    subtitle: description,
    href,
    iconName,
    meta: [
      { label: "Documentos", value: documentsLabel(links.length) },
      ...(updated ? [{ label: "Actualizado", value: `act. ${shortDate(updated)}` }] : []),
    ],
  };
}

const CATALOG_COLUMNS: RecordTableData["columns"] = [
  { key: "seccion", label: "Sección" },
  { key: "documentos", label: "Documentos", align: "right", format: "count" },
  { key: "actualizado", label: "Actualizado", format: "date" },
];

function catalogTable(cards: EntityCard[], counts: Map<string, { count: number; updated: string | null }>): RecordTableData {
  return {
    columns: CATALOG_COLUMNS,
    rows: cards.map((item) => ({
      id: item.id,
      href: item.href,
      seccion: item.title,
      documentos: counts.get(item.id)?.count ?? 0,
      actualizado: counts.get(item.id)?.updated ?? null,
    })),
  };
}

function matchesQuery(query: string, ...values: (string | undefined)[]): boolean {
  if (!query) return true;
  return values.some((value) => value !== undefined && normalize(value).includes(query));
}

/**
 * The index groups: Empresa (one card per company document, only when the
 * viewer can see Empresa) and Recursos (one card per section), each card with
 * its count and last update, plus the Analítico catalog table. `query` keeps
 * the cards whose name, description or any document title matches.
 */
export function buildBibliotecaGroups(
  links: ResourceLink[],
  options: { showEmpresa: boolean; query?: string },
): BibliotecaGroup[] {
  const query = normalize(options.query ?? "");
  const groups: BibliotecaGroup[] = [];

  if (options.showEmpresa) {
    const counts = new Map<string, { count: number; updated: string | null }>();
    const cards = EMPRESA_DOCS.flatMap((doc) => {
      const docLinks = empresaDocLinks(links, doc.slug);
      if (!matchesQuery(query, doc.title, doc.description, ...docLinks.map((l) => l.title))) return [];
      counts.set(`empresa:${doc.slug}`, { count: docLinks.length, updated: latest(docLinks) });
      return [card(`empresa:${doc.slug}`, doc.title, doc.description, doc.iconName, empresaDocHref(doc.slug), docLinks)];
    });
    groups.push({ key: "empresa", title: "Empresa", caption: "Lo mantiene Dirección", cards, table: catalogTable(cards, counts) });
  }

  const counts = new Map<string, { count: number; updated: string | null }>();
  const cards = BIBLIOTECA_RECURSOS.flatMap((item) => {
    const sectionLinks = links.filter((link) => link.section === item.section);
    if (!matchesQuery(query, item.title, item.description, ...sectionLinks.map((l) => l.title))) return [];
    counts.set(item.section, { count: sectionLinks.length, updated: latest(sectionLinks) });
    return [card(item.section, item.title, item.description, item.iconName, item.href, sectionLinks)];
  });
  groups.push({ key: "recursos", title: "Recursos", caption: "Formación, formatos y lo tuyo", cards, table: catalogTable(cards, counts) });

  return groups;
}

/** In-app route of a recent document: its Empresa document page, else none (it opens its URL). */
export function recentDocumentHref(links: ResourceLink[], doc: { id: string; section: ResourceSection; href?: string; url: string }): string {
  if (doc.href && doc.href.startsWith("/biblioteca/")) return doc.href;
  if (doc.section === "empresa") {
    const owner = EMPRESA_DOCS.find((item) => empresaDocLinks(links, item.slug).some((link) => link.id === doc.id));
    if (owner) return empresaDocHref(owner.slug, doc.id);
  }
  return doc.url;
}

// ── Sección ─────────────────────────────────────────────────────────────────

export type TipoFilter = ResourceLinkType;
export type TramoFilter = "general" | "diseno" | "construccion";

export const TIPO_LABEL: Record<ResourceLinkType, string> = {
  drive_folder: "Carpeta",
  drive_file: "Archivo",
  web: "Enlace web",
};

export const TRAMO_FILTER_LABEL: Record<TramoFilter, string> = {
  general: "General",
  diseno: "Diseño",
  construccion: "Construcción",
};

const APPLIES_TO_LABEL: Record<ResourceAppliesTo, string> = {
  general: "General",
  diseno: "Diseño",
  construccion: "Construcción",
  ambos: "Diseño y Construcción",
};

export function parseTipo(value: string | string[] | undefined): TipoFilter | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "drive_folder" || v === "drive_file" || v === "web" ? v : null;
}

export function parseTramo(value: string | string[] | undefined): TramoFilter | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "general" || v === "diseno" || v === "construccion" ? v : null;
}

function appliesToTramo(link: ResourceLink, tramo: TramoFilter): boolean {
  if (link.appliesTo === tramo) return true;
  if (link.appliesTo === "ambos") return tramo === "diseno" || tramo === "construccion";
  return link.subsection === tramo;
}

/** The section's rows after the tipo / tramo filters and the search text. */
export function filterSectionLinks(
  links: ResourceLink[],
  section: ResourceSection,
  filters: { tipo?: TipoFilter | null; tramo?: TramoFilter | null; query?: string },
): ResourceLink[] {
  const query = normalize(filters.query ?? "");
  return links
    .filter((link) => link.section === section)
    .filter((link) => !filters.tipo || link.linkType === filters.tipo)
    .filter((link) => !filters.tramo || appliesToTramo(link, filters.tramo))
    .filter((link) => matchesQuery(query, link.title, link.owner?.name))
    .sort(byOrder);
}

/** Same Drive item or same URL. */
function sameTarget(a: ResourceLink, b: ResourceLink): boolean {
  const aId = a.drive?.googleFileId ?? getDriveId(a.url);
  const bId = b.drive?.googleFileId ?? getDriveId(b.url);
  if (aId && bId) return aId === bId;
  return a.url.trim() === b.url.trim();
}

/** The viewer's "Mis favoritos" entry pointing at `link`, if any (the entry itself in that section). */
export function favoriteFor(link: ResourceLink, links: ResourceLink[]): ResourceLink | null {
  if (link.section === "mis-favoritos") return link;
  return links.find((other) => other.section === "mis-favoritos" && sameTarget(other, link)) ?? null;
}

export const SECTION_TABLE_COLUMNS: RecordTableData["columns"] = [
  { key: "favorito", label: "Favorito", width: 72 },
  { key: "nombre", label: "Nombre" },
  { key: "tipo", label: "Tipo" },
  { key: "tramo", label: "Tramo" },
  { key: "actualizado", label: "Actualizado", format: "date" },
  { key: "acciones", label: "Acciones", align: "right" },
];

/** `RecordTable` data of a section (no views / downloads columns, RD-7). */
export function sectionTable(rows: ResourceLink[], favoriteIds: ReadonlySet<string>): RecordTableData {
  return {
    columns: SECTION_TABLE_COLUMNS,
    rows: rows.map((link) => ({
      id: link.id,
      favorito: favoriteIds.has(link.id),
      nombre: link.title,
      tipo: TIPO_LABEL[link.linkType],
      tramo: APPLIES_TO_LABEL[link.appliesTo],
      actualizado: link.updatedAt,
      acciones: "",
    })),
  };
}

// ── Download ────────────────────────────────────────────────────────────────

/**
 * The download of a resource, as in the Recursos viewer: Drive files stream
 * through the app as the caller's account (Google-native documents export to
 * PDF). Null for folders, web links or without the Drive integration.
 */
export function resourceDownload(link: ResourceLink, driveEnabled: boolean): { href: string; label: string } | null {
  if (!driveEnabled || link.linkType !== "drive_file") return null;
  const fileId = link.drive?.googleFileId ?? getDriveId(link.url);
  if (!fileId) return null;
  const mime = link.drive?.mimeType ?? null;
  const isPdf = mime === "application/pdf" || (mime?.startsWith("application/vnd.google-apps.") ?? false) || /docs\.google\.com\//.test(link.url);
  return { href: driveContentUrl(fileId), label: isPdf && canPreviewInline(mime) ? "Descargar PDF" : "Descargar" };
}

// ── Style override ──────────────────────────────────────────────────────────

/** `?estilo=` one-render override (FE §4.2, RD-1); null when absent or unknown. */
export function parseEstilo(value: string | string[] | undefined): PresentationStyle | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "visual" || v === "esencial" || v === "analitico" ? v : null;
}
