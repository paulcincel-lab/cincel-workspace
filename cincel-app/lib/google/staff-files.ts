import { FOLDER_MIME_TYPE, isDriveNotFound, DriveAdminError, type DriveAdmin, type DriveFile } from "./drive-admin";
import type { StaffFileItem, StaffFilesResult } from "@/lib/types/workspace-access";
import type { DriveFolderStatus } from "@/lib/db/schema/projects";

/**
 * Staff Archivos tab (backend spec §A.6.3). The service account confirms the
 * requested folder sits under the project folder (parent walk, max depth 10,
 * cached 5 min) and yields the breadcrumbs; the listing itself runs with the
 * staff member's own Drive token, so Drive's sharing decides what they see.
 *
 * No `server-only` import and every dependency is passed in, so the logic is
 * testable without a database or Google; lib/google/staff-files-app.ts wires
 * the real ones.
 */

export const STAFF_ANCESTRY_CACHE_TTL_MS = 5 * 60_000;
export const STAFF_ANCESTRY_MAX_DEPTH = 10;
/** Upper bound on cached entries; the oldest are dropped first. */
export const STAFF_ANCESTRY_CACHE_MAX_ENTRIES = 5_000;

const PARENT_FIELDS = "id,name,parents,trashed";
const LIST_FIELDS = "id,name,mimeType,modifiedTime,size,iconLink,webViewLink,thumbnailLink";

/** The folder is unknown, trashed or outside the project: the route answers 404. */
export class StaffFolderNotFoundError extends Error {
  readonly status = 404;

  constructor(message = "No encontrado") {
    super(message);
    this.name = "StaffFolderNotFoundError";
  }
}

export function isStaffFolderNotFound(error: unknown): error is StaffFolderNotFoundError {
  return error instanceof StaffFolderNotFoundError;
}

export type FolderMeta = { id: string; name: string; parents: string[]; trashed: boolean };

export type ProjectAncestryOptions = {
  /** The service-account Drive client; null when it isn't configured. */
  getDrive: () => Pick<DriveAdmin, "get"> | null;
  ttlMs?: number;
  maxDepth?: number;
  maxEntries?: number;
  now?: () => number;
};

export type ProjectAncestry = {
  /**
   * Breadcrumbs from the project folder (first) down to `folderId` (last).
   * Throws StaffFolderNotFoundError when `folderId` isn't the project folder
   * or a descendant within the max depth.
   */
  breadcrumbs(folderId: string, rootFolderId: string): Promise<{ id: string; name: string }[]>;
  /** id, name, parents and trashed of one file, or null when Drive doesn't know it. Cached. */
  getMetaCached(fileId: string): Promise<FolderMeta | null>;
  clearCache(): void;
};

type CacheEntry = { expiresAt: number; value: Promise<FolderMeta | null> };

export function createProjectAncestry(options: ProjectAncestryOptions): ProjectAncestry {
  const ttlMs = options.ttlMs ?? STAFF_ANCESTRY_CACHE_TTL_MS;
  const maxDepth = options.maxDepth ?? STAFF_ANCESTRY_MAX_DEPTH;
  const maxEntries = options.maxEntries ?? STAFF_ANCESTRY_CACHE_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  async function fetchMeta(fileId: string): Promise<FolderMeta | null> {
    const drive = options.getDrive();
    if (!drive) throw new Error("Drive no está configurado (GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY)");
    try {
      const file = await drive.get(fileId, PARENT_FIELDS);
      return { id: file.id, name: file.name, parents: file.parents ?? [], trashed: file.trashed === true };
    } catch (error) {
      if (isDriveNotFound(error)) return null;
      throw error;
    }
  }

  function getMetaCached(fileId: string): Promise<FolderMeta | null> {
    const at = now();
    const hit = cache.get(fileId);
    if (hit && hit.expiresAt > at) return hit.value;
    if (hit) cache.delete(fileId);

    const value = fetchMeta(fileId);
    cache.set(fileId, { expiresAt: at + ttlMs, value });
    // Only definite answers stay cached; a Drive outage is retried next time.
    value.catch(() => {
      if (cache.get(fileId)?.value === value) cache.delete(fileId);
    });
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    return value;
  }

  async function breadcrumbs(folderId: string, rootFolderId: string): Promise<{ id: string; name: string }[]> {
    if (!folderId || !rootFolderId) throw new StaffFolderNotFoundError();

    const chain: FolderMeta[] = [];
    let current = folderId;
    if (current !== rootFolderId) {
      let reached = false;
      for (let depth = 0; depth < maxDepth; depth++) {
        const meta = await getMetaCached(current);
        if (!meta || meta.trashed) throw new StaffFolderNotFoundError();
        chain.push(meta);
        const parent = meta.parents[0];
        if (!parent) throw new StaffFolderNotFoundError();
        if (parent === rootFolderId) {
          reached = true;
          break;
        }
        current = parent;
      }
      if (!reached) throw new StaffFolderNotFoundError();
    }

    const root = await getMetaCached(rootFolderId);
    if (!root || root.trashed) throw new StaffFolderNotFoundError();
    return [root, ...chain.reverse()].map(({ id, name }) => ({ id, name }));
  }

  return { breadcrumbs, getMetaCached, clearCache: () => cache.clear() };
}

export function toStaffFileItem(file: DriveFile): StaffFileItem {
  const size = file.size === undefined || file.size === null ? null : Number(file.size);
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: size === null || Number.isNaN(size) ? null : size,
    modifiedAt: file.modifiedTime ?? "",
    iconLink: file.iconLink ?? null,
    webViewLink: file.webViewLink ?? null,
    thumbnailLink: file.thumbnailLink ?? null,
    kind: file.mimeType === FOLDER_MIME_TYPE ? "folder" : "file",
  };
}

export type StaffFilesProject = {
  driveFolderId: string | null;
  driveFolderStatus: DriveFolderStatus;
  driveFolderError: string | null;
};

export type StaffFilesDeps = {
  ancestry: Pick<ProjectAncestry, "breadcrumbs">;
  /** The staff member's own Drive token (drive.readonly), or needs_consent. */
  getStaffToken: () => Promise<{ status: "ok"; accessToken: string } | { status: "needs_consent" }>;
  /** A Drive client acting with the staff member's token. */
  openStaffDrive: (accessToken: string) => Pick<DriveAdmin, "listAll">;
};

/**
 * Steps 2–6 of §A.6.3 for a project that exists. Throws
 * StaffFolderNotFoundError (404) for a folder outside the project; other
 * errors (service account outage, Drive 5xx) propagate.
 */
export async function loadStaffFiles(
  project: StaffFilesProject,
  requestedFolderId: string | null,
  deps: StaffFilesDeps
): Promise<StaffFilesResult> {
  if (project.driveFolderStatus !== "ready" || !project.driveFolderId) {
    const status = project.driveFolderStatus === "failed" ? "failed" : "pending";
    return project.driveFolderError ? { status, error: project.driveFolderError } : { status };
  }

  const token = await deps.getStaffToken();
  if (token.status !== "ok") return { status: "needs_consent" };

  const folderId = requestedFolderId || project.driveFolderId;
  const breadcrumbs = await deps.ancestry.breadcrumbs(folderId, project.driveFolderId);

  let files: DriveFile[];
  try {
    files = await deps.openStaffDrive(token.accessToken).listAll({ parentId: folderId, fields: LIST_FIELDS });
  } catch (error) {
    if (error instanceof DriveAdminError) {
      if (error.status === 403 || error.status === 404) return { status: "no_drive_access" };
      // The token was revoked on Google's side after it was issued.
      if (error.status === 401) return { status: "needs_consent" };
    }
    throw error;
  }

  const items = files.map(toStaffFileItem).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "es");
  });
  return { status: "ok", folderId, breadcrumbs, items };
}
