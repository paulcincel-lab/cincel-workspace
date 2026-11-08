/**
 * Archivos tab of the redesigned project shell (redesign FE §3.5): maps the
 * staff Drive listing (`StaffFilesResult` "ok") to the widget shapes of
 * `lib/types/widgets.ts`. Pure and client-safe, so every style renders from
 * the same data.
 */
import { archivosHref, formatSize, SUBFOLDER_HINTS } from "@/components/proyectos/ProjectFilesBrowser";
import type { DistributionSegment, EntityCard, RecordColumn, RecordTableData } from "@/lib/types/widgets";
import type { StaffFileItem, StaffFilesResult } from "@/lib/types/workspace-access";

export type OkFilesResult = Extract<StaffFilesResult, { status: "ok" }>;

/** A listing entry; `version` and `author` are read when the listing carries them. */
export type ProjectFileSource = StaffFileItem & { version?: string | null; author?: string | null };

const GOOGLE_TYPES: Record<string, string> = {
  "application/vnd.google-apps.folder": "Carpeta",
  "application/vnd.google-apps.document": "Documento",
  "application/vnd.google-apps.spreadsheet": "Hoja de cálculo",
  "application/vnd.google-apps.presentation": "Presentación",
  "application/vnd.google-apps.drawing": "Dibujo",
  "application/vnd.google-apps.form": "Formulario",
  "application/vnd.google-apps.shortcut": "Acceso directo",
};

const shortDate = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });

/** es-MX date in lowercase ("3 nov 2026"); "—" when missing or invalid. */
export function formatFileDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : shortDate.format(date).replace(/\./g, "").toLowerCase();
}

/** Human size ("2.4 MB"); "—" for folders and native Google files. */
export const formatFileSize = formatSize;

/** Short type label: the extension in capitals ("PDF", "DWG"), the Google type, or the MIME family. */
export function fileTypeLabel(item: Pick<StaffFileItem, "name" | "mimeType" | "kind">): string {
  if (item.kind === "folder") return "Carpeta";
  const google = GOOGLE_TYPES[item.mimeType];
  if (google) return google;
  const dot = item.name.lastIndexOf(".");
  if (dot > 0 && dot < item.name.length - 1) {
    const ext = item.name.slice(dot + 1);
    if (/^[a-z0-9]{1,5}$/i.test(ext)) return ext.toUpperCase();
  }
  if (item.mimeType.startsWith("image/")) return "Imagen";
  if (item.mimeType.startsWith("video/")) return "Video";
  if (item.mimeType.startsWith("audio/")) return "Audio";
  if (item.mimeType === "application/pdf") return "PDF";
  return "Archivo";
}

/** Lucide icon name for a card. */
export function fileIconName(item: Pick<StaffFileItem, "name" | "mimeType" | "kind">): string {
  if (item.kind === "folder") return "folder";
  if (item.mimeType.startsWith("image/")) return "file-image";
  if (item.mimeType.startsWith("video/")) return "file-video";
  if (item.mimeType === "application/vnd.google-apps.spreadsheet" || /\.(xlsx?|csv)$/i.test(item.name)) {
    return "file-spreadsheet";
  }
  if (item.mimeType === "application/pdf" || item.mimeType === "application/vnd.google-apps.document") {
    return "file-text";
  }
  return "file";
}

/** Root and current folder of a listing. */
export function folderContext(result: OkFilesResult): {
  root: { id: string; name: string };
  current: { id: string; name: string };
  atRoot: boolean;
} {
  const root = result.breadcrumbs[0] ?? { id: result.folderId, name: "Proyecto" };
  const current = result.breadcrumbs[result.breadcrumbs.length - 1] ?? root;
  return { root, current, atRoot: result.folderId === root.id };
}

const LOCAL_ORIGIN = "http://archivos.local";

/**
 * The folder an Archivos link of `projectId` opens: its id, null for the
 * root, or undefined for any other link. Folder cards keep a real `href`
 * (middle click and open in a new tab work); a plain click on one is taken
 * over with it and opens the folder on the client (Query Migration 5d, #962).
 */
export function archivosFolderFromHref(projectId: string, href: string | null | undefined): string | null | undefined {
  if (!href) return undefined;
  let url: URL;
  try {
    url = new URL(href, LOCAL_ORIGIN);
  } catch {
    return undefined;
  }
  if (url.origin !== LOCAL_ORIGIN || url.pathname !== archivosHref(projectId)) return undefined;
  return url.searchParams.get("folder")?.trim() || null;
}

/** Folders first, then files: one card each (Visual grid). */
export function toFileCards(projectId: string, result: OkFilesResult): EntityCard[] {
  const { atRoot } = folderContext(result);
  return (result.items as ProjectFileSource[]).map((item) => {
    if (item.kind === "folder") {
      const hint = atRoot ? SUBFOLDER_HINTS[item.name] : undefined;
      return {
        id: item.id,
        title: item.name,
        subtitle: hint ?? "Carpeta",
        // A real link; `ProjectFiles` opens it on the client (`archivosFolderFromHref`).
        href: archivosHref(projectId, item.id),
        iconName: "folder",
        meta: [{ label: "Modificado", value: formatFileDate(item.modifiedAt) }],
      };
    }
    const meta = [
      { label: "Tamaño", value: formatFileSize(item.sizeBytes) },
      { label: "Modificado", value: formatFileDate(item.modifiedAt) },
    ];
    if (item.author) meta.push({ label: "Autor", value: item.author });
    return {
      id: item.id,
      title: item.name,
      subtitle: fileTypeLabel(item),
      ...(item.webViewLink ? { href: item.webViewLink } : {}),
      iconName: fileIconName(item),
      meta,
    };
  });
}

/**
 * File table (Esencial list, Analítico table): Nombre, Carpeta, Tipo, Tamaño,
 * Versión, Autor, Modificado. Versión and Autor appear only when the listing
 * carries them for at least one file.
 */
export function toFileTable(result: OkFilesResult): RecordTableData {
  const { current } = folderContext(result);
  const items = result.items as ProjectFileSource[];
  const hasVersion = items.some((i) => i.kind === "file" && i.version);
  const hasAuthor = items.some((i) => i.kind === "file" && i.author);

  const columns: RecordColumn[] = [
    { key: "nombre", label: "Nombre" },
    { key: "carpeta", label: "Carpeta", hideOn: ["esencial"] },
    { key: "tipo", label: "Tipo" },
    { key: "tamano", label: "Tamaño", align: "right", mono: true },
  ];
  if (hasVersion) columns.push({ key: "version", label: "Versión", align: "right", mono: true, hideOn: ["esencial"] });
  if (hasAuthor) columns.push({ key: "autor", label: "Autor", hideOn: ["esencial"] });
  columns.push({ key: "modificado", label: "Modificado", align: "right", mono: true });

  const rows = items.map((item) => ({
    id: item.id,
    kind: item.kind,
    href: item.kind === "folder" ? null : item.webViewLink,
    folderId: item.kind === "folder" ? item.id : null,
    nombre: item.name,
    carpeta: current.name,
    tipo: fileTypeLabel(item),
    tamano: item.kind === "folder" ? "—" : formatFileSize(item.sizeBytes),
    sizeBytes: item.kind === "folder" ? 0 : (item.sizeBytes ?? 0),
    ...(hasVersion ? { version: item.version ? `v${item.version}` : "—" } : {}),
    ...(hasAuthor ? { autor: item.author ?? "—" } : {}),
    modificado: formatFileDate(item.modifiedAt),
  }));

  const files = items.filter((i) => i.kind === "file");
  const totalBytes = files.reduce((sum, i) => sum + (i.sizeBytes ?? 0), 0);
  return {
    columns,
    rows,
    totals: {
      nombre: files.length === 1 ? "1 archivo" : `${files.length} archivos`,
      tamano: formatFileSize(totalBytes),
    },
  };
}

const TYPE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** Storage of the current folder by file type (files only; folders have no size in Drive). */
export function toStorageByType(result: OkFilesResult): DistributionSegment[] {
  const groups = new Map<string, { count: number; bytes: number }>();
  for (const item of result.items) {
    if (item.kind !== "file") continue;
    const label = fileTypeLabel(item);
    const group = groups.get(label) ?? { count: 0, bytes: 0 };
    group.count += 1;
    group.bytes += item.sizeBytes ?? 0;
    groups.set(label, group);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes || b[1].count - a[1].count || a[0].localeCompare(b[0], "es"))
    .map(([label, group], index) => ({
      key: label.toLowerCase(),
      label,
      value: group.count,
      colorVar: TYPE_COLORS[index % TYPE_COLORS.length],
      extra: { tamano: formatFileSize(group.bytes) },
    }));
}

/** Entry count shown on the Archivos tab (the folder the tab opens on). */
export function filesCount(result: StaffFilesResult): number {
  return result.status === "ok" ? result.items.length : 0;
}
