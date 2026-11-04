import "server-only";

import { createDriveAdmin, DRIVE_SCOPE, isDriveNotFound, type DriveAdmin } from "@/lib/google/drive-admin";
import { getServiceAccountTokenSource } from "@/lib/google/service-account";

/**
 * Ancestry guard for every portal Drive operation (list, download, preview,
 * upload). A file or folder is reachable only when walking its parents up
 * reaches the project's `02 Cliente` folder within 10 levels. Anything else
 * (trashed, another project, `01 Interno`, unknown to Drive, too deep) throws
 * a PortalNotFoundError so the route answers 404, never 403.
 *
 * Parent lookups go through the service account (lib/google/drive-admin.ts)
 * and are cached for 60 s, so a file staff move out of `02 Cliente` stops
 * being reachable within a minute. The cached names also feed breadcrumbs.
 */

export const PORTAL_PARENT_CACHE_TTL_MS = 60_000;
export const MAX_ANCESTRY_DEPTH = 10;
/** Upper bound on cached entries; the oldest are dropped first. */
export const PORTAL_PARENT_CACHE_MAX_ENTRIES = 5_000;

const PARENT_FIELDS = "id,name,parents,trashed";

export class PortalNotFoundError extends Error {
  readonly status = 404;

  constructor(message = "No encontrado") {
    super(message);
    this.name = "PortalNotFoundError";
  }
}

export function portalNotFound(): PortalNotFoundError {
  return new PortalNotFoundError();
}

export function isPortalNotFound(error: unknown): error is PortalNotFoundError {
  return error instanceof PortalNotFoundError;
}

export type DriveParentMeta = { id: string; name: string; parents: string[]; trashed: boolean };

export type DriveGuardProject = { driveClientFolderId: string | null };

export type DriveGuardOptions = {
  /** The service-account Drive client; null when it isn't configured. */
  getDrive: () => Pick<DriveAdmin, "get"> | null;
  ttlMs?: number;
  maxDepth?: number;
  maxEntries?: number;
  now?: () => number;
};

export type DriveGuard = {
  /**
   * Resolves when the id is the client folder or lives under it; returns the
   * chain from the file up to (not including) the client folder. Throws
   * PortalNotFoundError otherwise.
   */
  assertInsideClientFolder(fileOrFolderId: string, project: DriveGuardProject): Promise<DriveParentMeta[]>;
  /** id, name, parents and trashed of one file, or null when Drive doesn't know it. Cached. */
  getParentCached(fileId: string): Promise<DriveParentMeta | null>;
  clearCache(): void;
};

type CacheEntry = { expiresAt: number; value: Promise<DriveParentMeta | null> };

export function createDriveGuard(options: DriveGuardOptions): DriveGuard {
  const ttlMs = options.ttlMs ?? PORTAL_PARENT_CACHE_TTL_MS;
  const maxDepth = options.maxDepth ?? MAX_ANCESTRY_DEPTH;
  const maxEntries = options.maxEntries ?? PORTAL_PARENT_CACHE_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  async function fetchMeta(fileId: string): Promise<DriveParentMeta | null> {
    const drive = options.getDrive();
    if (!drive) throw portalNotFound();
    try {
      const file = await drive.get(fileId, PARENT_FIELDS);
      return { id: file.id, name: file.name, parents: file.parents ?? [], trashed: file.trashed === true };
    } catch (error) {
      if (isDriveNotFound(error)) return null;
      throw error;
    }
  }

  function getParentCached(fileId: string): Promise<DriveParentMeta | null> {
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

  async function assertInsideClientFolder(
    fileOrFolderId: string,
    project: DriveGuardProject
  ): Promise<DriveParentMeta[]> {
    const root = project.driveClientFolderId;
    if (!root || !fileOrFolderId) throw portalNotFound();
    if (fileOrFolderId === root) return [];

    const chain: DriveParentMeta[] = [];
    let current = fileOrFolderId;
    for (let depth = 0; depth < maxDepth; depth++) {
      const meta = await getParentCached(current);
      if (!meta || meta.trashed) throw portalNotFound();
      chain.push(meta);
      const parent = meta.parents[0];
      if (!parent) throw portalNotFound();
      if (parent === root) return chain;
      current = parent;
    }
    throw portalNotFound();
  }

  return { assertInsideClientFolder, getParentCached, clearCache: () => cache.clear() };
}

let serviceAccountDrive: DriveAdmin | null | undefined;

function getServiceAccountDrive(): DriveAdmin | null {
  if (serviceAccountDrive === undefined) {
    const getAccessToken = getServiceAccountTokenSource([DRIVE_SCOPE]);
    serviceAccountDrive = getAccessToken ? createDriveAdmin({ getAccessToken }) : null;
  }
  return serviceAccountDrive;
}

/** Process-wide guard on the service account, shared by every portal route. */
export const portalDriveGuard = createDriveGuard({ getDrive: getServiceAccountDrive });

export function assertInsideClientFolder(
  fileOrFolderId: string,
  project: DriveGuardProject
): Promise<DriveParentMeta[]> {
  return portalDriveGuard.assertInsideClientFolder(fileOrFolderId, project);
}
