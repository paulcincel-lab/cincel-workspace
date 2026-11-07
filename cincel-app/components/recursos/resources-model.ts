/**
 * Shared resource model of the Recursos workspace and the Biblioteca
 * (redesign FE §3.7, §4.11.1): section labels and order, the "Abiertos
 * recientemente" localStorage list (`cincel.resources.recent-docs.v1`) and
 * the preview resolution of the resource viewer. `ResourcesWorkspace` and the
 * `components/biblioteca/*` screens both read these, so the two never drift.
 */
import { getDriveId, getDrivePreviewUrl, hasDriveUrl } from "@/lib/google/drive-url";
import { readStorage, removeStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import type { ResourceLink, ResourceSection } from "@/lib/types/resource";

export const RECENT_DOCS_STORAGE_KEY = "cincel.resources.recent-docs.v1";

const RECENT_DOCS_LIMIT = 8;

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

export function loadRecentDocuments(): RecentDocument[] {
  const stored = readStorage(RECENT_DOCS_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as RecentDocument[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => ({
        ...item,
        url: item.url ?? item.href,
      }))
      .filter((item) => hasDriveUrl(item.url))
      .slice(0, RECENT_DOCS_LIMIT);
  } catch {
    removeStorage(RECENT_DOCS_STORAGE_KEY);
    return [];
  }
}

export function saveRecentDocuments(next: RecentDocument[]): void {
  writeStorage(RECENT_DOCS_STORAGE_KEY, JSON.stringify(next.slice(0, RECENT_DOCS_LIMIT)));
}

/**
 * Puts `link` first in the recent list (same key and shape as always) and
 * returns the new list. Storage failures (private mode, quota) are ignored.
 */
export function rememberRecentDocument(
  link: Pick<ResourceLink, "id" | "title" | "url" | "section">,
  options: { href?: string; now?: Date } = {},
): RecentDocument[] {
  const entry: RecentDocument = {
    id: link.id,
    title: link.title,
    url: link.url,
    ...(options.href ? { href: options.href } : {}),
    openedAt: (options.now ?? new Date()).toISOString(),
    section: link.section,
  };
  try {
    const next = [entry, ...loadRecentDocuments().filter((item) => item.id !== link.id)].slice(0, RECENT_DOCS_LIMIT);
    saveRecentDocuments(next);
    return next;
  } catch {
    return [entry];
  }
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
