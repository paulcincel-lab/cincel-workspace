import "server-only";

import {
  createDriveAdmin,
  DRIVE_SCOPE,
  FOLDER_MIME_TYPE,
  type DriveAdmin,
  type DriveFile,
} from "@/lib/google/drive-admin";
import { getServiceAccountTokenSource } from "@/lib/google/service-account";
import { portalDriveGuard, type DriveGuard, type DriveGuardProject } from "@/lib/portal/drive-guard";
import type { PortalFileDTO, PortalFolderDTO, PortalFolderGroupDTO } from "@/lib/types/portal";

/**
 * Lists one folder under a project's `02 Cliente` for the client portal
 * (BE §B.4.4). Every folder goes through assertInsideClientFolder first, so
 * `01 Interno`, another project's folders and unknown ids answer 404.
 *
 * Drive is asked only for id, name, mimeType, size and modifiedTime: links,
 * owners and permissions are never requested, and the DTO mapper copies only
 * the PortalFileDTO fields. Shortcuts and Google-native types that can't be
 * exported to PDF (Forms, Sites, Maps, ...) are dropped; Docs, Sheets, Slides
 * and Drawings are delivered as PDF.
 *
 * Listings are cached per folder for 60 s in process (bounded, oldest out
 * first), so a file staff add to `02 Cliente` shows up within a minute.
 */

export const PORTAL_LIST_CACHE_TTL_MS = 60_000;
export const PORTAL_LIST_CACHE_MAX_ENTRIES = 1_000;
/** Label of the first breadcrumb: the project's `02 Cliente` folder. */
export const PORTAL_ROOT_BREADCRUMB = "Archivos";

export const PORTAL_LIST_FIELDS = "id,name,mimeType,size,modifiedTime";

export const SHORTCUT_MIME_TYPE = "application/vnd.google-apps.shortcut";
const GOOGLE_APPS_PREFIX = "application/vnd.google-apps.";

/** Google-native types the portal delivers through `files.export` as PDF. */
export const PDF_EXPORTABLE_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.drawing",
]);

export function isGoogleNativeMimeType(mimeType: string): boolean {
  return mimeType.startsWith(GOOGLE_APPS_PREFIX) && mimeType !== FOLDER_MIME_TYPE;
}

/** Maps one Drive entry to the portal DTO, or null when the portal must not show it. */
export function toPortalFileDTO(file: DriveFile): PortalFileDTO | null {
  const mimeType = file.mimeType;
  if (!file.id || !mimeType) return null;
  const isFolder = mimeType === FOLDER_MIME_TYPE;
  if (!isFolder && isGoogleNativeMimeType(mimeType) && !PDF_EXPORTABLE_MIME_TYPES.has(mimeType)) return null;

  const size = file.size === undefined ? NaN : Number(file.size);
  return {
    id: file.id,
    name: file.name,
    mimeType,
    sizeBytes: isFolder || !Number.isFinite(size) ? null : size,
    modifiedAt: file.modifiedTime ?? "",
    kind: isFolder ? "folder" : "file",
    deliveredAs: PDF_EXPORTABLE_MIME_TYPES.has(mimeType) ? "pdf" : "original",
  };
}

/** Folders first, then by name (Spanish collation, case- and accent-insensitive). */
export function sortPortalItems(items: PortalFileDTO[]): PortalFileDTO[] {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "es", { sensitivity: "base", numeric: true });
  });
}

export type PortalFileListerOptions = {
  /** The service-account Drive client; null when it isn't configured. */
  getDrive: () => Pick<DriveAdmin, "listAll"> | null;
  guard: Pick<DriveGuard, "assertInsideClientFolder">;
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
};

export type PortalFileLister = {
  /**
   * The folder's contents and breadcrumbs. `folderId` defaults to the client
   * folder. Throws PortalNotFoundError when the folder is outside it.
   */
  listFolder(project: DriveGuardProject, folderId?: string | null): Promise<PortalFolderDTO>;
  clearCache(): void;
};

export class PortalDriveUnavailableError extends Error {
  constructor() {
    super("Google Drive no está configurado");
    this.name = "PortalDriveUnavailableError";
  }
}

type CacheEntry = { expiresAt: number; value: Promise<PortalFileDTO[]> };

export function createPortalFileLister(options: PortalFileListerOptions): PortalFileLister {
  const ttlMs = options.ttlMs ?? PORTAL_LIST_CACHE_TTL_MS;
  const maxEntries = options.maxEntries ?? PORTAL_LIST_CACHE_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  async function fetchItems(folderId: string): Promise<PortalFileDTO[]> {
    const drive = options.getDrive();
    if (!drive) throw new PortalDriveUnavailableError();
    const files = await drive.listAll({
      parentId: folderId,
      q: `mimeType != '${SHORTCUT_MIME_TYPE}'`,
      fields: PORTAL_LIST_FIELDS,
    });
    const items: PortalFileDTO[] = [];
    for (const file of files) {
      if (file.mimeType === SHORTCUT_MIME_TYPE) continue;
      const item = toPortalFileDTO(file);
      if (item) items.push(item);
    }
    return sortPortalItems(items);
  }

  function getItemsCached(folderId: string): Promise<PortalFileDTO[]> {
    const at = now();
    const hit = cache.get(folderId);
    if (hit && hit.expiresAt > at) {
      // Refresh recency so the bound drops the least recently used folder.
      cache.delete(folderId);
      cache.set(folderId, hit);
      return hit.value;
    }
    if (hit) cache.delete(folderId);

    const value = fetchItems(folderId);
    cache.set(folderId, { expiresAt: at + ttlMs, value });
    // Only successful listings stay cached; a Drive error is retried next time.
    value.catch(() => {
      if (cache.get(folderId)?.value === value) cache.delete(folderId);
    });
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    return value;
  }

  async function listFolder(project: DriveGuardProject, folderId?: string | null): Promise<PortalFolderDTO> {
    const root = project.driveClientFolderId;
    const target = folderId || root || "";
    // Throws PortalNotFoundError for a missing root and anything outside it.
    const chain = await options.guard.assertInsideClientFolder(target, project);
    const items = await getItemsCached(target);

    const breadcrumbs = [
      { id: root as string, name: PORTAL_ROOT_BREADCRUMB },
      ...chain
        .slice()
        .reverse()
        .map((meta) => ({ id: meta.id, name: meta.name })),
    ];
    return { folderId: target, breadcrumbs, items };
  }

  return { listFolder, clearCache: () => cache.clear() };
}

let serviceAccountDrive: DriveAdmin | null | undefined;

function getServiceAccountDrive(): DriveAdmin | null {
  if (serviceAccountDrive === undefined) {
    const getAccessToken = getServiceAccountTokenSource([DRIVE_SCOPE]);
    serviceAccountDrive = getAccessToken ? createDriveAdmin({ getAccessToken }) : null;
  }
  return serviceAccountDrive;
}

/** Process-wide lister on the service account, shared by every portal request. */
export const portalFileLister = createPortalFileLister({ getDrive: getServiceAccountDrive, guard: portalDriveGuard });

export function listPortalFolder(project: DriveGuardProject, folderId?: string | null): Promise<PortalFolderDTO> {
  return portalFileLister.listFolder(project, folderId);
}

/** Name of the group holding the files at the top of `02 Cliente`. */
export const PORTAL_ROOT_FOLDER_GROUP = "General";
/** Subfolders listed for the Resumen (by name): 1 + up to 10 Drive calls per load, each cached 60 s. */
export const PORTAL_FOLDER_GROUPS_MAX_SUBFOLDERS = 10;

type ListFolder = (project: DriveGuardProject, folderId?: string | null) => Promise<PortalFolderDTO>;

/**
 * The client folder one level deep, for the Resumen and Analítico "por carpeta" views: the files at the top
 * of `02 Cliente` ("General"), then the files of its first 10 subfolders by name, listed in parallel. Every
 * listing goes through the same guard and fields as the Archivos tab; only `kind === "file"` entries are
 * kept. Empty subfolders stay, so a folder the team prepared shows as such.
 */
export async function listPortalFolderGroupsWith(
  listFolder: ListFolder,
  project: DriveGuardProject,
): Promise<PortalFolderGroupDTO[]> {
  const root = await listFolder(project);
  const subfolders = root.items
    .filter((item) => item.kind === "folder")
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base", numeric: true }))
    .slice(0, PORTAL_FOLDER_GROUPS_MAX_SUBFOLDERS);
  const children = await Promise.all(subfolders.map((sub) => listFolder(project, sub.id)));
  const filesOf = (items: PortalFileDTO[]) => items.filter((item) => item.kind === "file");
  return [
    { folderId: root.folderId, name: PORTAL_ROOT_FOLDER_GROUP, files: filesOf(root.items) },
    ...children.map((child, i) => ({ folderId: child.folderId, name: subfolders[i].name, files: filesOf(child.items) })),
  ];
}

export function listPortalFolderGroups(project: DriveGuardProject): Promise<PortalFolderGroupDTO[]> {
  return listPortalFolderGroupsWith(listPortalFolder, project);
}
