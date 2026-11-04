import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { createDriveAdmin, DRIVE_SCOPE, type DriveAdmin } from "./drive-admin";
import { isGoogleFake } from "./fake";
import {
  ensureProjectFolders,
  renameProjectFolder,
  type EnsureProjectFoldersResult,
  type ProjectFoldersDb,
  type RenameProjectFolderResult,
} from "./project-folders";
import { getServiceAccountTokenSource } from "./service-account";

/**
 * App side of the project folders: builds the service-account Drive client
 * from env and runs ensureProjectFolders / renameProjectFolder against the app
 * database. projects-actions calls these from `after()`, so they never throw:
 * every failure ends up in `drive_folder_status` / `drive_folder_error` and the
 * server log.
 *
 * Env: GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY, GOOGLE_SHARED_DRIVE_ID.
 * With GOOGLE_FAKE=1 nothing reaches Drive and the project stays `pending`.
 */

export const DRIVE_NOT_CONFIGURED_ERROR =
  "Drive no está configurado (GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY)";

type Env = Record<string, string | undefined>;

export type ProjectDriveDeps = {
  db: ProjectFoldersDb;
  /** Null when the service account isn't configured. */
  openDrive: () => DriveAdmin | null;
  sharedDriveId: string;
  /** True skips Drive entirely (GOOGLE_FAKE=1). */
  skip: boolean;
};

/** The service-account Drive client, or null when its credentials are missing. */
export function openServiceAccountDriveAdmin(env: Env = process.env): DriveAdmin | null {
  const getAccessToken = getServiceAccountTokenSource([DRIVE_SCOPE], env);
  return getAccessToken ? createDriveAdmin({ getAccessToken }) : null;
}

export function projectDriveDepsFromEnv(env: Env = process.env): ProjectDriveDeps {
  return {
    db: db as unknown as ProjectFoldersDb,
    openDrive: () => openServiceAccountDriveAdmin(env),
    sharedDriveId: env.GOOGLE_SHARED_DRIVE_ID?.trim() ?? "",
    skip: isGoogleFake(env),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

/**
 * Creates the project's folder and subfolders (or only what is missing). A
 * missing service account is recorded as `failed` like any Drive error.
 * Returns null when skipped.
 */
export async function syncProjectFolders(
  projectId: string,
  deps: ProjectDriveDeps = projectDriveDepsFromEnv(),
): Promise<EnsureProjectFoldersResult | null> {
  if (deps.skip) return null;
  try {
    const drive = deps.openDrive();
    if (!drive) {
      await deps.db
        .update(projects)
        .set({ driveFolderStatus: "failed", driveFolderError: DRIVE_NOT_CONFIGURED_ERROR })
        .where(eq(projects.id, projectId));
      return { status: "failed", error: DRIVE_NOT_CONFIGURED_ERROR };
    }
    const result = await ensureProjectFolders(deps.db, drive, projectId, deps.sharedDriveId);
    if (result.status === "failed") console.error(`[drive] project ${projectId} folders failed: ${result.error}`);
    return result;
  } catch (error) {
    console.error(`[drive] project ${projectId} folders failed: ${errorMessage(error)}`);
    return { status: "failed", error: errorMessage(error) };
  }
}

/**
 * Renames the project's folder after a name or code change. Best effort: a
 * failure goes to `drive_folder_error`, the status stays as it is. Returns null
 * when skipped or Drive isn't configured.
 */
export async function syncProjectFolderName(
  projectId: string,
  deps: ProjectDriveDeps = projectDriveDepsFromEnv(),
): Promise<RenameProjectFolderResult | null> {
  if (deps.skip) return null;
  try {
    const drive = deps.openDrive();
    if (!drive) return null;
    const result = await renameProjectFolder(deps.db, drive, projectId);
    if (result.status === "failed") console.error(`[drive] project ${projectId} rename failed: ${result.error}`);
    return result;
  } catch (error) {
    console.error(`[drive] project ${projectId} rename failed: ${errorMessage(error)}`);
    return { status: "failed", error: errorMessage(error) };
  }
}
