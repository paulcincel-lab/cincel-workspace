/**
 * Shared resource model of the Recursos workspace and the Biblioteca
 * (redesign FE §3.7, §4.11.1): section labels and order, the pure helpers
 * of the "Abiertos recientemente" list (stored by `useRecentDocs`,
 * `lib/stores/recent-docs-store.ts`, under `cincel.resources.recent-docs.v1`)
 * and the preview resolution of the resource viewer. Pure: no storage access.
 */
import { getDriveId, getDrivePreviewUrl, hasDriveUrl } from "@/lib/google/drive-url";
import type { ResourceLink, ResourceSection } from "@/lib/types/resource";

export const RECENT_DOCS_STORAGE_KEY = "cincel.resources.recent-docs.v1";

/** How many entries "Abiertos recientemente" keeps. */
export const RECENT_DOCS_LIMIT = 8;

export const SECTION_ORDER: ResourceSection[] = [
  "mis-documentos",
  "mis-favoritos",
  "plantillas-diseno",
  "formatos-obra",
  "mis-vacaciones",
  "formacion",
  "empresa",
];

export const PRIMARY_SECTION_ORDER: ResourceSection[] = [
  "mis-documentos",
  "mis-favoritos",
  "plantillas-diseno",
  "formatos-obra",
  "mis-vacaciones",
  "formacion",
];

export const SECTION_LABEL: Record<ResourceSection, string> = {
  "mis-documentos": "Mis documentos",
  "mis-favoritos": "Mis Favoritos",
  "plantillas-diseno": "Plantillas de diseño",
  "formatos-obra": "Formatos de Obra",
  "mis-vacaciones": "Mis Vacaciones",
  formacion: "Formación",
  empresa: "Empresa",
};

export const SECTION_DESCRIPTION: Record<ResourceSection, string> = {
  "mis-documentos": "Documentos personales del integrante seleccionado.",
  "mis-favoritos": "Documentos marcados como favoritos para consulta rápida.",
  "plantillas-diseno": "Plantillas y formatos de diseño.",
  "formatos-obra": "Formatos operativos para obra.",
  "mis-vacaciones": "Formato y documentos de vacaciones.",
  formacion: "Material de apoyo, aprendizaje y referencia.",
  empresa: "Documentos internos e institucionales.",
};

/** One entry of the "Abiertos recientemente" list, as stored in localStorage. */
export type RecentDocument = {
  id: string;
  title: string;
  url: string;
  /** In-app route of the document (Biblioteca empresa documents); older entries stored the URL here. */
  href?: string;
  openedAt: string;
  section: ResourceSection;
};

/** What a writer passes to remember a document: the resource link's own fields. */
export type RecentDocumentInput = Pick<ResourceLink, "id" | "title" | "url" | "section">;

/**
 * The stored list as it should be read: entries with a Drive URL (older
 * entries kept it in `href`), at most `RECENT_DOCS_LIMIT`. Anything that is
 * not an array reads as empty.
 */
export function normalizeRecentDocuments(value: unknown): RecentDocument[] {
  if (!Array.isArray(value)) return [];
  return (value as RecentDocument[])
    .filter((item) => typeof item === "object" && item !== null)
    .map((item) => ({ ...item, url: item.url ?? item.href }))
    .filter((item) => typeof item.url === "string" && hasDriveUrl(item.url))
    .slice(0, RECENT_DOCS_LIMIT);
}

/** `doc` first in `list` (an older entry of the same id dropped), at most `RECENT_DOCS_LIMIT`. */
export function withRecentDocument(
  list: RecentDocument[],
  doc: RecentDocumentInput,
  options: { href?: string; now?: Date } = {},
): RecentDocument[] {
  const entry: RecentDocument = {
    id: doc.id,
    title: doc.title,
    url: doc.url,
    ...(options.href ? { href: options.href } : {}),
    openedAt: (options.now ?? new Date()).toISOString(),
    section: doc.section,
  };
  return [entry, ...list.filter((item) => item.id !== doc.id)].slice(0, RECENT_DOCS_LIMIT);
}

/** The recent list, or (when nothing was opened yet) the first Drive files of `links`. */
export function recentDocumentsToShow(recent: RecentDocument[], links: ResourceLink[], fallbackCount = 4): RecentDocument[] {
  if (recent.length > 0) return recent;
  return links
    .filter((link) => link.linkType === "drive_file")
    .slice(0, fallbackCount)
    .map((link) => ({
      id: link.id,
      title: link.title,
      url: link.url,
      openedAt: link.updatedAt,
      section: link.section,
    }));
}

/**
 * How the resource viewer shows `link`: an embeddable preview URL (Drive /
 * Docs iframe) and, when the Drive picker is configured, the Drive id served
 * through the app as the caller's connected account (#433).
 */
export function resolveResourcePreview(
  link: ResourceLink | null,
  driveEnabled: boolean,
): { previewUrl: string | null; driveFileId: string | null } {
  if (!link) return { previewUrl: null, driveFileId: null };
  const previewUrl = getDrivePreviewUrl(link.url, link.linkType);
  const driveFileId = driveEnabled && link.linkType !== "web" ? (link.drive?.googleFileId ?? getDriveId(link.url)) : null;
  return { previewUrl, driveFileId };
}
