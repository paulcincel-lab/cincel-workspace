/**
 * Biblioteca catalog (redesign FE §3.7): the Empresa documents and Recursos
 * sections, how resource links map onto them, and the widget data the index,
 * sección and documento screens render. Pure and client-safe; the pages load
 * the links with the existing resource actions.
 */
import type { ResourcesCapabilities } from "@/lib/auth/permissions";
import { canPreviewInline, driveContentUrl, getDriveId, hasDriveUrl } from "@/lib/google/drive-url";
import type { ResourceAppliesTo, ResourceLink, ResourceLinkType, ResourceSection } from "@/lib/types/resource";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { MyVacations } from "@/lib/vacations/reads";
import type { Group } from "@/components/widgets/GroupedTable";
import type { EntityCard, RecordColumn, RecordTableData } from "@/lib/types/widgets";

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
  { section: "formacion", title: "Formación", description: "Cursos, guías y normativa", iconName: "graduation-cap", href: "/biblioteca/formacion" },
  { section: "formatos-obra", title: "Formatos de obra", description: "Bitácoras, actas y presupuestos", iconName: "clipboard-list", href: "/biblioteca/formatos-obra" },
  { section: "plantillas-diseno", title: "Plantillas de diseño", description: "Carátulas, láminas y renders base", iconName: "pencil-ruler", href: "/biblioteca/plantillas-diseno" },
  { section: "mis-documentos", title: "Mis documentos", description: "Tus archivos y los compartidos contigo", iconName: "folder", href: "/biblioteca/mis-documentos" },
  { section: "mis-favoritos", title: "Mis favoritos", description: "Lo que marcaste con estrella.", iconName: "star", href: "/biblioteca/mis-favoritos" },
  { section: "mis-vacaciones", title: "Mis vacaciones", description: "Saldo disponible y solicitudes", iconName: "calendar-days", href: "/biblioteca/vacaciones" },
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

// ── Page data (Query Migration Phase 8) ────────────────────────────────────

/** The Recursos sections `getBibliotecaPageData` reads: the `[seccion]` slugs plus `mis-vacaciones`. */
export const BIBLIOTECA_SECTIONS = [
  "formacion",
  "formatos-obra",
  "plantillas-diseno",
  "mis-documentos",
  "mis-favoritos",
  "mis-vacaciones",
] as const satisfies readonly Exclude<ResourceSection, "empresa">[];

/** The `section` of `qk.biblioteca.links(section)`: a Recursos section, `empresa`, or null for the index. */
export type BibliotecaLinksSection = (typeof BIBLIOTECA_SECTIONS)[number] | "empresa";

/**
 * Whether the viewer may read `biblioteca.links(section)`: Empresa with
 * `enterprise.canView`, the index with either capability, Mis vacaciones
 * always (its documents are empty without `canViewResources`, as the page
 * always was), and every other section with `canViewResources`.
 */
export function canViewBibliotecaSection(capabilities: ResourcesCapabilities, section: BibliotecaLinksSection | null): boolean {
  if (section === null) return capabilities.canViewResources || capabilities.enterprise.canView;
  if (section === "empresa") return capabilities.enterprise.canView;
  if (section === "mis-vacaciones") return true;
  return capabilities.canViewResources;
}

/**
 * The sections the SQL read of `biblioteca.links(section)` covers: the index
 * reads every section it may see; a Recursos section reads its own rows plus
 * the viewer's "Mis favoritos" (the star of each row); Empresa and Mis
 * vacaciones only their own.
 */
export function bibliotecaQuerySections(
  section: BibliotecaLinksSection | null,
  capabilities: ResourcesCapabilities,
): ResourceSection[] {
  const recursos: ResourceSection[] = capabilities.canViewResources ? [...BIBLIOTECA_SECTIONS] : [];
  if (section === null) return capabilities.enterprise.canView ? [...recursos, "empresa"] : recursos;
  if (section === "empresa") return capabilities.enterprise.canView ? ["empresa"] : [];
  if (!capabilities.canViewResources) return [];
  if (section === "mis-favoritos" || section === "mis-vacaciones") return [section];
  return [section, "mis-favoritos"];
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

/** Whether any of `values` contains the search text `query` (accent- and case-insensitive; empty matches all). */
export function matchesSearch(query: string, ...values: (string | undefined)[]): boolean {
  return matchesQuery(normalize(query), ...values);
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

// ── Overview (Visual and Esencial index) ────────────────────────────────────

/** One card of the index overview: the company documents, a Recursos section or Mis vacaciones. */
export type BibliotecaCardKey = "empresa" | BibliotecaSectionSlug | "mis-vacaciones";

/** A chart color slot (`chart-1` … `chart-5`). */
export type ChartSlot = 1 | 2 | 3 | 4 | 5;

/** One stable color per section, the same in every style; null is the neutral tile. */
export const BIBLIOTECA_SECTION_COLOR: Record<BibliotecaCardKey, ChartSlot | null> = {
  "plantillas-diseno": 1,
  "formatos-obra": 2,
  formacion: 3,
  "mis-documentos": 4,
  empresa: 5,
  "mis-vacaciones": null,
  "mis-favoritos": null,
};

export type BibliotecaSectionStat = {
  key: BibliotecaCardKey;
  title: string;
  description: string;
  iconName: string;
  href: string;
  count: number;
  /** Documents created within the last 7 days. */
  newCount: number;
  updatedAt: string | null;
  color: ChartSlot | null;
};

export type EmpresaDocStat = { slug: EmpresaDocSlug; title: string; iconName: string; href: string; count: number; isNew: boolean };

export type BibliotecaOverview = {
  /** Documents of the colored sections (the donut). */
  total: number;
  newThisWeek: number;
  /** Frame order: plantillas, formatos, formacion, empresa, mis-documentos, mis-vacaciones. */
  sections: BibliotecaSectionStat[];
  /** Null without `enterprise.canView`. */
  empresa: EmpresaDocStat[] | null;
  /** The newest part of the Manual de la empresa created within 14 days. */
  manualHighlight: { title: string; href: string } | null;
  favoritesCount: number;
};

/** The company documents card of the overview. */
export const EMPRESA_CARD = {
  title: "La empresa",
  description: "Book, manual, imagen, RFC y políticas",
  iconName: "building-2",
  href: empresaDocHref("manual-de-la-empresa"),
} as const;

const OVERVIEW_ORDER: readonly BibliotecaCardKey[] = [
  "plantillas-diseno",
  "formatos-obra",
  "formacion",
  "empresa",
  "mis-documentos",
  "mis-vacaciones",
];

const DAY_MS = 24 * 60 * 60 * 1000;

function within(iso: string | null | undefined, now: Date, days: number): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  return now.getTime() - time <= days * DAY_MS && time <= now.getTime() + DAY_MS;
}

function sectionStat(
  key: BibliotecaCardKey,
  meta: { title: string; description: string; iconName: string; href: string },
  links: ResourceLink[],
  now: Date,
): BibliotecaSectionStat {
  return {
    key,
    ...meta,
    count: links.length,
    newCount: links.filter((link) => within(link.createdAt, now, 7)).length,
    updatedAt: latest(links),
    color: BIBLIOTECA_SECTION_COLOR[key],
  };
}

/** Whether a part of the Manual de la empresa was updated within the last 14 days. */
export function manualRecentlyUpdated(links: ResourceLink[], now: Date): boolean {
  return empresaDocLinks(links, "manual-de-la-empresa").some((link) => within(link.updatedAt, now, 14));
}

/**
 * The index overview of the Visual and Esencial styles: one stat per card in
 * frame order (Empresa only with `showEmpresa`; the Recursos sections only
 * with `showRecursos`, default true; Mis vacaciones always), the company
 * documents, the newest Manual part of the last 14 days and the favorites
 * count. `query` keeps the cards whose name, description or any document
 * title matches (accent- and case-insensitive).
 */
export function buildBibliotecaOverview(
  links: ResourceLink[],
  o: { showEmpresa: boolean; showRecursos?: boolean; query?: string; now: Date },
): BibliotecaOverview {
  const query = normalize(o.query ?? "");
  const showRecursos = o.showRecursos ?? true;
  const sections: BibliotecaSectionStat[] = [];

  for (const key of OVERVIEW_ORDER) {
    if (key === "empresa") {
      if (!o.showEmpresa) continue;
      const empresa = links.filter((link) => link.section === "empresa");
      if (!matchesQuery(query, EMPRESA_CARD.title, EMPRESA_CARD.description, ...empresa.map((l) => l.title))) continue;
      sections.push(sectionStat(key, EMPRESA_CARD, empresa, o.now));
      continue;
    }
    if (key !== "mis-vacaciones" && !showRecursos) continue;
    const item = recurso(key);
    if (!item) continue;
    const own = links.filter((link) => link.section === key);
    if (!matchesQuery(query, item.title, item.description, ...own.map((l) => l.title))) continue;
    sections.push(sectionStat(key, item, own, o.now));
  }

  const colored = sections.filter((stat) => stat.color !== null);

  let empresa: EmpresaDocStat[] | null = null;
  let manualHighlight: BibliotecaOverview["manualHighlight"] = null;
  if (o.showEmpresa) {
    empresa = EMPRESA_DOCS.map((doc) => {
      const parts = empresaDocLinks(links, doc.slug);
      return {
        slug: doc.slug,
        title: doc.title,
        iconName: doc.iconName,
        href: empresaDocHref(doc.slug),
        count: parts.length,
        isNew: parts.some((part) => within(part.createdAt, o.now, 7)),
      };
    });
    const manual = empresaDoc("manual-de-la-empresa")!;
    const parts = empresaDocLinks(links, manual.slug);
    const toc = new Map(documentToc(parts, manual).map((entry) => [entry.id, entry.label]));
    const newest = parts
      .filter((part) => within(part.createdAt, o.now, 14))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0];
    if (newest) manualHighlight = { title: toc.get(newest.id) ?? newest.title, href: empresaDocHref(manual.slug, newest.id) };
  }

  return {
    total: colored.reduce((sum, stat) => sum + stat.count, 0),
    newThisWeek: colored.reduce((sum, stat) => sum + stat.newCount, 0),
    sections,
    empresa,
    manualHighlight,
    favoritesCount: links.filter((link) => link.section === "mis-favoritos").length,
  };
}

// ── Document badges and dates ───────────────────────────────────────────────

export type DocumentBadge = "PDF" | "DOC" | "XLSX" | "PPT" | "DWG" | "JPG" | "PNG" | "MP4" | "Carpeta" | "Enlace" | "Archivo";

const BADGE_BY_EXTENSION: Record<string, DocumentBadge> = {
  pdf: "PDF",
  doc: "DOC",
  docx: "DOC",
  odt: "DOC",
  rtf: "DOC",
  txt: "DOC",
  xls: "XLSX",
  xlsx: "XLSX",
  xlsm: "XLSX",
  ods: "XLSX",
  csv: "XLSX",
  ppt: "PPT",
  pptx: "PPT",
  odp: "PPT",
  key: "PPT",
  dwg: "DWG",
  dxf: "DWG",
  jpg: "JPG",
  jpeg: "JPG",
  png: "PNG",
  mp4: "MP4",
  mov: "MP4",
  m4v: "MP4",
};

const BADGE_BY_MIME: Record<string, DocumentBadge> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOC",
  "application/vnd.google-apps.document": "DOC",
  "application/vnd.ms-excel": "XLSX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.google-apps.spreadsheet": "XLSX",
  "text/csv": "XLSX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPT",
  "application/vnd.google-apps.presentation": "PPT",
  "application/acad": "DWG",
  "image/vnd.dwg": "DWG",
  "image/x-dwg": "DWG",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "video/mp4": "MP4",
  "video/quicktime": "MP4",
  "application/vnd.google-apps.folder": "Carpeta",
};

const BADGE_BY_DOCS_KIND: Record<string, DocumentBadge> = { document: "DOC", spreadsheets: "XLSX", presentation: "PPT" };

function extensionOf(name: string | null | undefined): string | null {
  const match = name?.trim().match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * The format badge of a document: the extension of its Drive file name, else
 * its MIME type, else its URL (a Google Docs / Sheets / Slides link or a file
 * extension), else its link type.
 */
export function documentBadge(link: Pick<ResourceLink, "linkType" | "url" | "drive">): DocumentBadge {
  const ext = extensionOf(link.drive?.fileName);
  if (ext && BADGE_BY_EXTENSION[ext]) return BADGE_BY_EXTENSION[ext];
  const mime = link.drive?.mimeType ?? null;
  if (mime && BADGE_BY_MIME[mime]) return BADGE_BY_MIME[mime];
  if (link.linkType === "drive_folder") return "Carpeta";
  const docs = link.url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\//);
  if (docs) return BADGE_BY_DOCS_KIND[docs[1]];
  const urlExt = extensionOf(link.url.split(/[?#]/)[0]);
  if (urlExt && BADGE_BY_EXTENSION[urlExt]) return BADGE_BY_EXTENSION[urlExt];
  return link.linkType === "web" ? "Enlace" : "Archivo";
}

const LOCAL_DAY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Mexico_City" });

function localDay(date: Date): string {
  return LOCAL_DAY.format(date);
}

function previousDay(day: string): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** When a document was opened: "hace 5 min", "hace 2 h", "ayer" or the short date ("6 nov"). */
export function relativeOpened(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 60) return `hace ${Math.max(1, minutes)} min`;
  if (minutes < 24 * 60) return `hace ${Math.floor(minutes / 60)} h`;
  if (localDay(date) === previousDay(localDay(now))) return "ayer";
  return shortDate(iso);
}

// ── Vacations card ──────────────────────────────────────────────────────────

export type NextVacation = { available: number; next: { from: string; to: string } | null };

/** The vacations card: available days and the next approved request that has not ended (`to >= today`). */
export function nextVacation(v: MyVacations | null, today: string): NextVacation | null {
  if (!v) return null;
  const upcoming = v.requests
    .filter((request) => request.status === "aprobada" && request.to >= today)
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))[0];
  return { available: v.balance.available, next: upcoming ? { from: upcoming.from, to: upcoming.to } : null };
}

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dayParts(iso: string): { day: number; month: string; key: string } {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return { day, month: MONTH_SHORT[(month || 1) - 1] ?? "", key: `${year}-${month}` };
}

/** A vacation range: "22 dic", "22–26 dic" or "28 dic–3 ene". */
export function vacationRange(from: string, to: string): string {
  const a = dayParts(from);
  const b = dayParts(to);
  if (from.slice(0, 10) === to.slice(0, 10)) return `${a.day} ${a.month}`;
  if (a.key === b.key) return `${a.day}–${b.day} ${b.month}`;
  return `${a.day} ${a.month}–${b.day} ${b.month}`;
}

// ── Featured templates ──────────────────────────────────────────────────────

/** The newest `count` design templates by last update. */
export function featuredTemplates(links: ResourceLink[], count = 3): ResourceLink[] {
  return links
    .filter((link) => link.section === "plantillas-diseno")
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, count);
}

const NATIVE_KIND_BY_MIME: Record<string, string> = {
  "application/vnd.google-apps.document": "document",
  "application/vnd.google-apps.spreadsheet": "spreadsheets",
  "application/vnd.google-apps.presentation": "presentation",
};

/**
 * "Usar plantilla": a Google-native file opens its Drive copy page
 * (`/copy`), any other link opens as it does today.
 */
export function templateUseHref(link: Pick<ResourceLink, "url" | "drive">): string {
  const docs = link.url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/);
  if (docs) return `https://docs.google.com/${docs[1]}/d/${docs[2]}/copy`;
  const kind = link.drive?.mimeType ? NATIVE_KIND_BY_MIME[link.drive.mimeType] : undefined;
  if (kind && link.drive?.googleFileId) return `https://docs.google.com/${kind}/d/${link.drive.googleFileId}/copy`;
  return link.url;
}

// ── Sección ─────────────────────────────────────────────────────────────────

export type TipoFilter = ResourceLinkType;
export type EtapaFilter = "general" | "diseno" | "construccion";

export const TIPO_LABEL: Record<ResourceLinkType, string> = {
  drive_folder: "Carpeta",
  drive_file: "Archivo",
  web: "Enlace web",
};

export const ETAPA_FILTER_LABEL: Record<EtapaFilter, string> = {
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

export function parseEtapa(value: string | string[] | undefined): EtapaFilter | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "general" || v === "diseno" || v === "construccion" ? v : null;
}

function appliesToEtapa(link: ResourceLink, etapa: EtapaFilter): boolean {
  if (link.appliesTo === etapa) return true;
  if (link.appliesTo === "ambos") return etapa === "diseno" || etapa === "construccion";
  return link.subsection === etapa;
}

/** The section's rows after the tipo / etapa filters and the search text. */
export function filterSectionLinks(
  links: ResourceLink[],
  section: ResourceSection,
  filters: { tipo?: TipoFilter | null; etapa?: EtapaFilter | null; query?: string },
): ResourceLink[] {
  const query = normalize(filters.query ?? "");
  return links
    .filter((link) => link.section === section)
    .filter((link) => !filters.tipo || link.linkType === filters.tipo)
    .filter((link) => !filters.etapa || appliesToEtapa(link, filters.etapa))
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
  { key: "etapa", label: "Etapa" },
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
      etapa: APPLIES_TO_LABEL[link.appliesTo],
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

// ── Analítico index (issue #1006) ───────────────────────────────────────────

/** `?mostrar=`: every document, the ones updated within 30 days, or the ones older than 180 days. */
export type BibliotecaMostrar = "todos" | "actualizados" | "sin-actualizar";
/** `?clase=` (not `?tipo=`, which `/biblioteca/[seccion]` uses). */
export type BibliotecaTipo = "todos" | "pdf" | "plantilla" | "hoja" | "video";
export type BibliotecaIndexFilters = {
  mostrar: BibliotecaMostrar;
  clase: BibliotecaTipo;
  /** `?favoritos=1`: only documents the viewer starred. */
  favoritos: boolean;
  q: string;
  /** `?abiertos=formatos-obra,empresa`: the expanded sections. */
  abiertos: string[];
};

export const BIBLIOTECA_INDEX_FILTERS_DEFAULT: BibliotecaIndexFilters = {
  mostrar: "todos",
  clase: "todos",
  favoritos: false,
  q: "",
  abiertos: [],
};

const MOSTRAR_VALUES: readonly BibliotecaMostrar[] = ["todos", "actualizados", "sin-actualizar"];
const CLASE_VALUES: readonly BibliotecaTipo[] = ["todos", "pdf", "plantilla", "hoja", "video"];

/** The Analítico index filters from the URL; unknown values fall back to the defaults. */
export function parseBibliotecaIndexFilters(sp: URLSearchParams): BibliotecaIndexFilters {
  const mostrar = sp.get("mostrar");
  const clase = sp.get("clase");
  const abiertos = (sp.get("abiertos") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id, index, all) => id.length > 0 && all.indexOf(id) === index);
  return {
    mostrar: MOSTRAR_VALUES.includes(mostrar as BibliotecaMostrar) ? (mostrar as BibliotecaMostrar) : "todos",
    clase: CLASE_VALUES.includes(clase as BibliotecaTipo) ? (clase as BibliotecaTipo) : "todos",
    favoritos: sp.get("favoritos") === "1",
    q: sp.get("q") ?? "",
    abiertos,
  };
}

/**
 * Writes `patch` onto `current` (other params kept): defaults are removed so
 * a clean URL means the default view. `abiertos: null` removes the list (the
 * default expansion); an empty list keeps `?abiertos=` (everything closed).
 */
export function bibliotecaIndexSearch(
  current: URLSearchParams,
  patch: Partial<Omit<BibliotecaIndexFilters, "abiertos">> & { abiertos?: string[] | null },
): string {
  const next = new URLSearchParams(current);
  const set = (key: string, value: string | null) => (value === null ? next.delete(key) : next.set(key, value));
  if (patch.mostrar !== undefined) set("mostrar", patch.mostrar === "todos" ? null : patch.mostrar);
  if (patch.clase !== undefined) set("clase", patch.clase === "todos" ? null : patch.clase);
  if (patch.favoritos !== undefined) set("favoritos", patch.favoritos ? "1" : null);
  if (patch.q !== undefined) set("q", patch.q.trim() ? patch.q : null);
  if (patch.abiertos !== undefined) set("abiertos", patch.abiertos === null ? null : patch.abiertos.join(","));
  return next.toString();
}

export type DocumentTipo = "PDF" | "Plantilla" | "Hoja" | "Video" | "Enlace" | "Carpeta" | "Documento";

const SHEET_MIME = /spreadsheet|excel|text\/csv/;

/**
 * The document kind of the Analítico "Tipo" column and `?clase=`: Plantillas
 * de diseño (or a link created from a template, outside Empresa) is
 * `Plantilla`; otherwise by MIME type / file name / URL: PDF, spreadsheet
 * (`Hoja`), video, folder, web link (`Enlace`), else `Documento`.
 */
export function documentTipo(link: ResourceLink): DocumentTipo {
  if (link.section === "plantillas-diseno" || (link.templateKey !== null && link.section !== "empresa")) return "Plantilla";
  if (link.linkType === "drive_folder") return "Carpeta";
  const mime = link.drive?.mimeType ?? "";
  const name = (link.drive?.fileName ?? link.url.split(/[?#]/)[0]).toLowerCase();
  if (mime === "application/vnd.google-apps.folder") return "Carpeta";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (SHEET_MIME.test(mime) || /\.(xlsx?|xlsm|ods|csv)$/.test(name) || /docs\.google\.com\/spreadsheets\//.test(link.url)) return "Hoja";
  if (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/.test(name)) return "Video";
  if (link.linkType === "web") return "Enlace";
  return "Documento";
}

const CLASE_TIPO: Record<Exclude<BibliotecaTipo, "todos">, DocumentTipo> = {
  pdf: "PDF",
  plantilla: "Plantilla",
  hoja: "Hoja",
  video: "Video",
};

/** Label of a document's etapa (`appliesTo`). */
export function appliesToLabel(appliesTo: ResourceAppliesTo): string {
  return APPLIES_TO_LABEL[appliesTo];
}

/** Open counts of the last 30 days of the visible links (only counts, never who). */
export type BibliotecaUsage = { byLink: Record<string, { opens30d: number; mine30d: number }>; opensThisWeek: number };

/** `BibliotecaUsage` from the per-link aggregate, keeping only the links the viewer sees. */
export function bibliotecaUsage(
  counts: readonly { linkId: string; opens30d: number; mine30d: number; week: number }[],
  links: readonly ResourceLink[],
): BibliotecaUsage {
  const visible = new Set(links.map((link) => link.id));
  const byLink: BibliotecaUsage["byLink"] = {};
  let opensThisWeek = 0;
  for (const row of counts) {
    if (!visible.has(row.linkId)) continue;
    byLink[row.linkId] = { opens30d: row.opens30d, mine30d: row.mine30d };
    opensThisWeek += row.week;
  }
  return { byLink, opensThisWeek };
}

export type BibliotecaRow = {
  id: string;
  href: string;
  nombre: string;
  tipo: DocumentTipo;
  etapa: ResourceAppliesTo;
  responsable: string | null;
  /** ISO `updatedAt`. */
  actualizado: string;
  /** Not updated for more than 180 days. */
  stale: boolean;
  sizeBytes: number | null;
  /** Null without open data. */
  opens30d: number | null;
  isNew: boolean;
};

/** Where a level-2 group creates documents (quick-add) and where its "más en" link goes. */
export type BibliotecaGroupTarget = {
  section: Exclude<ResourceSection, "mis-favoritos" | "mis-vacaciones">;
  projectId: string | null;
  /** The Empresa document's slug (its parts carry it as `templateKey`). */
  templateKey: string | null;
  label: string;
  /** Documents of the group beyond the first 3 rows. */
  moreCount: number;
  moreHref: string;
};

export type BibliotecaTable = {
  kpis: { documentos: number; secciones: number; actualizados30: number; sinActualizar: number; abiertosSemana: number | null };
  groups: Group<BibliotecaRow>[];
  totals: { documentos: number; secciones: number; opens30d: number | null; sinActualizar: number };
  /** Per filter option (`mostrar:todos`, `clase:pdf`, `favoritos:1`…), with the other filters applied. */
  counts: Record<string, number>;
  /** "Nombre" … "Aperturas 30 d"; "Tamaño" only with size data, "Aperturas 30 d" only with open data. */
  columns: RecordColumn[];
  /** Level-2 group id → its target. */
  targets: Record<string, BibliotecaGroupTarget>;
  /** Top group ids that hold at least one document, in order. */
  nonEmpty: string[];
  /** Documents per top group (the "Ir a" counts). */
  sectionCounts: Record<string, number>;
};

/** The Analítico sections, in frame order ("Ir a"). */
export const BIBLIOTECA_TABLE_SECTIONS = [
  { id: "empresa", title: "La empresa" },
  { id: "formatos-obra", title: "Formatos de obra" },
  { id: "plantillas-diseno", title: "Plantillas de diseño" },
  { id: "formacion", title: "Formación" },
  { id: "mis-documentos", title: "Mis documentos" },
] as const satisfies readonly { id: BibliotecaGroupTarget["section"]; title: string }[];

/** Level-2 rows shown before the "más en" link. */
export const BIBLIOTECA_GROUP_ROWS = 3;
export const GENERAL_PROJECT_LABEL = "General (sin proyecto)";

const ANALITICO_DAY_MS = 24 * 60 * 60 * 1000;

function ageDays(iso: string, now: Date): number {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : (now.getTime() - time) / ANALITICO_DAY_MS;
}

/** Updated more than 180 days ago (180 d exactly is not stale). */
export function isStale(iso: string, now: Date): boolean {
  return ageDays(iso, now) > 180;
}

/** Updated within the last 30 days (30 d exactly counts). */
export function isRecentlyUpdated(iso: string, now: Date): boolean {
  return ageDays(iso, now) <= 30;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function byUpdatedDesc(a: ResourceLink, b: ResourceLink): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.title.localeCompare(b.title, "es-MX");
}

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const SIZE_FORMAT = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/** "2.4 MB" (es-MX); "—" without a size. */
export function formatDocumentSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(value) : SIZE_FORMAT.format(value)} ${SIZE_UNITS[unit]}`;
}

const TIME_FORMAT = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" });
const DAY_KEY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Mexico_City" });

function dayKey(date: Date): string {
  return DAY_KEY.format(date);
}

/** When the viewer opened a document: "hoy 7:50", "ayer" or the short date ("6 nov"). */
export function openedLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (dayKey(date) === dayKey(now)) return `hoy ${TIME_FORMAT.format(date)}`;
  const yesterday = new Date(now.getTime() - ANALITICO_DAY_MS);
  if (dayKey(date) === dayKey(yesterday)) return "ayer";
  return shortDate(iso);
}

type Container = { id: string; label: string; links: ResourceLink[]; target: BibliotecaGroupTarget };

/** A level-2 group: its first 3 rows by `updatedAt` desc, with its metrics. */
function childGroup(container: Container, toRow: (link: ResourceLink) => BibliotecaRow, usage: BibliotecaUsage | null): Group<BibliotecaRow> {
  const sorted = [...container.links].sort(byUpdatedDesc);
  const rows = sorted.slice(0, BIBLIOTECA_GROUP_ROWS).map(toRow);
  const all = sorted.map(toRow);
  const stale = all.filter((row) => row.stale).length;
  const opens = usage ? all.reduce((sum, row) => sum + (row.opens30d ?? 0), 0) : null;
  container.target.moreCount = Math.max(0, sorted.length - BIBLIOTECA_GROUP_ROWS);
  return {
    id: container.id,
    label: container.label,
    caption: plural(container.links.length, "documento", "documentos"),
    metrics: [
      ...(opens !== null ? [{ key: "aperturas", value: plural(opens, "apertura", "aperturas") }] : []),
      stale > 0
        ? { key: "estado", value: `${stale} sin actualizar`, tone: "warning" as const }
        : { key: "estado", value: "al día", tone: "muted" as const },
    ],
    rows,
  };
}

/**
 * The Analítico index (frame `Biblioteca-Analitico`): one top group per
 * section (La empresa, only with `showEmpresa`; Formatos de obra, Plantillas
 * de diseño, Formación and Mis documentos, only with `showRecursos`, default
 * true), a second level per project (`General (sin proyecto)` first, then
 * projects by name) or, for La empresa, per company document, the KPIs, the
 * totals and the count of every filter option. Filters combine (AND). Rows
 * per level-2 group are the first 3 by `updatedAt` (the rest is the "más en"
 * link, `targets[id].moreCount`). Without `usage` every open figure is null.
 */
export function buildBibliotecaTable(
  links: ResourceLink[],
  f: BibliotecaIndexFilters,
  o: { showEmpresa: boolean; showRecursos?: boolean; now: Date; usage: BibliotecaUsage | null; newIds?: ReadonlySet<string> },
): BibliotecaTable {
  const showRecursos = o.showRecursos ?? true;
  const sections = BIBLIOTECA_TABLE_SECTIONS.filter((s) => (s.id === "empresa" ? o.showEmpresa : showRecursos));
  const universe = links.filter((link) => sections.some((s) => s.id === link.section));
  const query = normalize(f.q);

  const matches = {
    mostrar: (link: ResourceLink, value: BibliotecaMostrar) =>
      value === "todos" ||
      (value === "actualizados" ? isRecentlyUpdated(link.updatedAt, o.now) : isStale(link.updatedAt, o.now)),
    clase: (link: ResourceLink, value: BibliotecaTipo) => value === "todos" || documentTipo(link) === CLASE_TIPO[value],
    favoritos: (link: ResourceLink, value: boolean) => !value || favoriteFor(link, links) !== null,
    q: (link: ResourceLink) => matchesQuery(query, link.title, link.owner?.name, link.project?.name),
  };
  const passes = (link: ResourceLink, skip: "mostrar" | "clase" | "favoritos" | null) =>
    (skip === "mostrar" || matches.mostrar(link, f.mostrar)) &&
    (skip === "clase" || matches.clase(link, f.clase)) &&
    (skip === "favoritos" || matches.favoritos(link, f.favoritos)) &&
    matches.q(link);

  const counts: Record<string, number> = {};
  for (const value of MOSTRAR_VALUES) {
    counts[`mostrar:${value}`] = universe.filter((link) => passes(link, "mostrar") && matches.mostrar(link, value)).length;
  }
  for (const value of CLASE_VALUES) {
    counts[`clase:${value}`] = universe.filter((link) => passes(link, "clase") && matches.clase(link, value)).length;
  }
  counts["favoritos:0"] = universe.filter((link) => passes(link, "favoritos")).length;
  counts["favoritos:1"] = universe.filter((link) => passes(link, "favoritos") && matches.favoritos(link, true)).length;

  const filtered = new Set(universe.filter((link) => passes(link, null)).map((link) => link.id));
  const keep = (list: ResourceLink[]) => list.filter((link) => filtered.has(link.id));

  const toRow = (href: (link: ResourceLink) => string) => (link: ResourceLink): BibliotecaRow => ({
    id: link.id,
    href: href(link),
    nombre: link.title,
    tipo: documentTipo(link),
    etapa: link.appliesTo,
    responsable: link.owner?.name ?? null,
    actualizado: link.updatedAt,
    stale: isStale(link.updatedAt, o.now),
    sizeBytes: link.drive?.sizeBytes ?? null,
    opens30d: o.usage ? (o.usage.byLink[link.id]?.opens30d ?? 0) : null,
    isNew: o.newIds?.has(link.id) ?? false,
  });

  const targets: Record<string, BibliotecaGroupTarget> = {};
  const groups: Group<BibliotecaRow>[] = [];
  const nonEmpty: string[] = [];
  const sectionCounts: Record<string, number> = {};
  const shown = new Map<string, ResourceLink>();
  let containers = 0;

  for (const section of sections) {
    const children: Group<BibliotecaRow>[] = [];
    const sectionLinks = new Map<string, ResourceLink>();
    const moreHref = `/biblioteca/${section.id}`;

    if (section.id === "empresa") {
      for (const doc of EMPRESA_DOCS) {
        const parts = keep(empresaDocLinks(links, doc.slug));
        const id = `empresa:${doc.slug}`;
        targets[id] = { section: "empresa", projectId: null, templateKey: doc.slug, label: doc.title, moreCount: 0, moreHref: empresaDocHref(doc.slug) };
        if (parts.length > 0) containers += 1;
        parts.forEach((part) => sectionLinks.set(part.id, part));
        children.push(
          childGroup(
            { id, label: doc.title, links: parts, target: targets[id] },
            toRow((part) => empresaDocHref(doc.slug, part.id)),
            o.usage,
          ),
        );
      }
    } else {
      const own = keep(universe.filter((link) => link.section === section.id));
      if (own.length > 0) containers += 1;
      own.forEach((link) => sectionLinks.set(link.id, link));
      const byProject = new Map<string, { name: string; links: ResourceLink[] }>();
      for (const link of own) {
        const key = link.project?.id ?? "";
        const entry = byProject.get(key) ?? { name: link.project?.name ?? GENERAL_PROJECT_LABEL, links: [] };
        entry.links.push(link);
        byProject.set(key, entry);
      }
      if (!byProject.has("")) byProject.set("", { name: GENERAL_PROJECT_LABEL, links: [] });
      const ordered = [...byProject.entries()].sort(([a, x], [b, y]) =>
        a === "" ? -1 : b === "" ? 1 : x.name.localeCompare(y.name, "es-MX"),
      );
      for (const [projectId, entry] of ordered) {
        const id = `${section.id}:${projectId || "general"}`;
        targets[id] = { section: section.id, projectId: projectId || null, templateKey: null, label: entry.name, moreCount: 0, moreHref };
        children.push(childGroup({ id, label: entry.name, links: entry.links, target: targets[id] }, toRow((link) => link.url), o.usage));
      }
    }

    const docs = [...sectionLinks.values()];
    docs.forEach((link) => shown.set(link.id, link));
    if (docs.length > 0) nonEmpty.push(section.id);
    sectionCounts[section.id] = docs.length;
    const stale = docs.filter((link) => isStale(link.updatedAt, o.now)).length;
    const opens = o.usage ? docs.reduce((sum, link) => sum + (o.usage!.byLink[link.id]?.opens30d ?? 0), 0) : null;
    const updated = latest(docs);
    const size = docs.reduce((sum, link) => sum + (link.drive?.sizeBytes ?? 0), 0);
    const hasSize = docs.some((link) => typeof link.drive?.sizeBytes === "number");
    const groupCount = section.id === "empresa" ? "5 secciones" : section.id === "mis-documentos" ? "solo tú" : plural(children.length, "grupo", "grupos");
    groups.push({
      id: section.id,
      label: section.title,
      caption: docs.length === 0 ? "0 documentos" : `${plural(docs.length, "documento", "documentos")} · ${groupCount}`,
      metrics: [
        ...(updated ? [{ key: "actualizado", value: `Act. ${shortDate(updated)}` }] : []),
        ...(opens !== null ? [{ key: "aperturas", label: "aperturas 30 d", value: String(opens) }] : []),
        stale > 0
          ? { key: "estado", value: `${stale} sin actualizar`, tone: "warning" as const, pill: true }
          : { key: "estado", value: "al día", tone: "muted" as const, pill: true },
      ],
      children: docs.length === 0 ? [] : children,
      footer: {
        nombre: `Total · ${plural(docs.length, "documento", "documentos")}`,
        ...(hasSize ? { sizeBytes: formatDocumentSize(size) } : {}),
        ...(opens !== null ? { opens30d: opens } : {}),
      },
    });
  }

  const all = [...shown.values()];
  const sinActualizar = all.filter((link) => isStale(link.updatedAt, o.now)).length;
  const opens30d = o.usage ? all.reduce((sum, link) => sum + (o.usage!.byLink[link.id]?.opens30d ?? 0), 0) : null;
  const hasSize = all.some((link) => typeof link.drive?.sizeBytes === "number");

  const columns: RecordColumn[] = [
    { key: "nombre", label: "Nombre", width: 300 },
    { key: "tipo", label: "Tipo", width: 100 },
    { key: "etapa", label: "Etapa", width: 170 },
    { key: "responsable", label: "Responsable", width: 150 },
    { key: "actualizado", label: "Actualizado", format: "date", width: 110 },
    ...(hasSize ? [{ key: "sizeBytes", label: "Tamaño", align: "right" as const, mono: true, width: 90 }] : []),
    ...(o.usage ? [{ key: "opens30d", label: "Aperturas 30 d", align: "right" as const, format: "count" as const, width: 120 }] : []),
  ];

  return {
    kpis: {
      documentos: all.length,
      secciones: containers,
      actualizados30: all.filter((link) => isRecentlyUpdated(link.updatedAt, o.now)).length,
      sinActualizar,
      abiertosSemana: o.usage ? o.usage.opensThisWeek : null,
    },
    groups,
    totals: { documentos: all.length, secciones: containers, opens30d, sinActualizar },
    counts,
    columns,
    targets,
    nonEmpty,
    sectionCounts,
  };
}

export type BibliotecaRecentRow = {
  id: string;
  href: string;
  documento: string;
  seccion: string;
  proyecto: string;
  abierto: string;
  /** The viewer's own opens in 30 days; null without open data. */
  veces30d: number | null;
};

/** "Abiertos recientemente" of the Analítico index: the viewer's last 5 opened documents. */
export function bibliotecaRecentRows(
  recents: readonly { id: string; title: string; url: string; openedAt: string; section: ResourceSection; href?: string }[],
  links: ResourceLink[],
  o: { now: Date; usage: BibliotecaUsage | null },
): BibliotecaRecentRow[] {
  const byId = new Map(links.map((link) => [link.id, link]));
  return recents.slice(0, 5).map((doc) => {
    const link = byId.get(doc.id);
    return {
      id: doc.id,
      href: recentDocumentHref(links, doc),
      documento: doc.title,
      seccion: doc.section === "empresa" ? "La empresa" : (recurso(doc.section)?.title ?? doc.section),
      proyecto: link?.project?.name ?? (doc.section === "empresa" ? "—" : "General"),
      abierto: openedLabel(doc.openedAt, o.now),
      veces30d: o.usage ? (o.usage.byLink[doc.id]?.mine30d ?? 0) : null,
    };
  });
}
