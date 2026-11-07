import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "../db/schema";
import { projects } from "../db/schema";
import { escapeQueryValue, FOLDER_MIME_TYPE, type DriveAdmin } from "./drive-admin";

/**
 * A project's folder tree in the company Shared Drive:
 *
 *   <code> · <name>/
 *     01 Interno/
 *     02 Cliente/        (only once the project has a client)
 *     03 Del cliente/    (only once the project has a client)
 *
 * A project starts without a client (project flow), so "02 Cliente" and
 * "03 Del cliente" are created together when the client is set; until then the
 * tree is complete with the project folder and "01 Interno" alone.
 *
 * The folder ids are stored on the project (`drive_*` columns) and
 * `drive_folder_status` says whether the tree is complete. Running it again
 * reuses every id already stored and only creates what is missing; a missing
 * subfolder is looked up by name under the project folder before one is
 * created.
 *
 * `db` and `drive` are passed in: the monday CLI passes its own drizzle client,
 * the app passes lib/db/client.ts. No `server-only` import here.
 */

export const INTERNAL_FOLDER_NAME = "01 Interno";
export const CLIENT_FOLDER_NAME = "02 Cliente";
export const INBOUND_FOLDER_NAME = "03 Del cliente";

/** Longest folder name we create (Drive allows more; this keeps paths readable). */
export const MAX_FOLDER_NAME_LENGTH = 200;

/** Any drizzle Postgres database or transaction over the app schema. */
export type ProjectFoldersDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export type ProjectFolderIds = {
  folderId: string;
  internalFolderId: string;
  /** Null while the project has no client (the folder isn't created yet). */
  clientFolderId: string | null;
  /** Null while the project has no client (the folder isn't created yet). */
  inboundFolderId: string | null;
};

export type EnsureProjectFoldersOptions = {
  /**
   * Whether "02 Cliente" and "03 Del cliente" belong in the tree. Defaults to
   * whether the project has a client (`client_id is not null`).
   */
  withClientFolder?: boolean;
};

/**
 * Whether the stored tree is complete: the project folder and "01 Interno"
 * always, the two client folders only `withClientFolder`.
 */
export function isProjectFolderTreeComplete(
  stored: { folderId: string | null; internalFolderId: string | null; clientFolderId: string | null; inboundFolderId: string | null },
  withClientFolder: boolean,
): boolean {
  if (!stored.folderId || !stored.internalFolderId) return false;
  if (!withClientFolder) return true;
  return Boolean(stored.clientFolderId && stored.inboundFolderId);
}

export type EnsureProjectFoldersResult =
  | { status: "ready"; folders: ProjectFolderIds; created: number }
  | { status: "failed"; error: string };

export class ProjectNotFoundError extends Error {
  constructor(readonly projectId: string) {
    super(`Proyecto no encontrado: ${projectId}`);
    this.name = "ProjectNotFoundError";
  }
}

/**
 * `<code> · <name>`, or `<name>` when the project has no code. `/` and control
 * characters become spaces, runs of spaces collapse, and the result is cut to
 * 200 characters.
 */
export function projectFolderName(project: { code: string | null; name: string }): string {
  const code = project.code?.trim();
  const raw = code ? `${code} · ${project.name}` : project.name;
  const cleaned = raw.replace(/[/\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(cleaned).slice(0, MAX_FOLDER_NAME_LENGTH).join("").trim();
}

async function findChildFolder(drive: DriveAdmin, parentId: string, name: string): Promise<string | null> {
  const { files } = await drive.list({
    parentId,
    q: `name = '${escapeQueryValue(name)}' and mimeType = '${FOLDER_MIME_TYPE}'`,
    pageSize: 10,
    fields: "id,name,mimeType",
  });
  return files[0]?.id ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

/**
 * Makes sure the project's folder and its subfolders exist in the Shared Drive
 * and records their ids on the project. "02 Cliente" and "03 Del cliente" are
 * only created `withClientFolder` (by default: when the project has a client);
 * without them the tree counts as complete, so a client-less project doesn't
 * rebuild it on every sync. Setting the client later and running it again
 * creates just the two client folders.
 *
 * - The project folder is created in `sharedDriveId` (the Shared Drive root)
 *   unless `drive_folder_id` is already set. Its id is saved as soon as it
 *   exists, so an interrupted run never creates a second one.
 * - Each subfolder whose id isn't stored is found by name under the project
 *   folder, or created.
 * - Success sets `drive_folder_status = 'ready'` and clears
 *   `drive_folder_error`. A Drive failure sets `failed` with the message and is
 *   returned, not thrown, so the project stays usable.
 *
 * Throws ProjectNotFoundError when the project doesn't exist.
 */
export async function ensureProjectFolders(
  db: ProjectFoldersDb,
  drive: DriveAdmin,
  projectId: string,
  sharedDriveId: string,
  options: EnsureProjectFoldersOptions = {},
): Promise<EnsureProjectFoldersResult> {
  const [project] = await db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      clientId: projects.clientId,
      driveFolderId: projects.driveFolderId,
      driveInternalFolderId: projects.driveInternalFolderId,
      driveClientFolderId: projects.driveClientFolderId,
      driveInboundFolderId: projects.driveInboundFolderId,
      driveFolderStatus: projects.driveFolderStatus,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new ProjectNotFoundError(projectId);
  const withClientFolder = options.withClientFolder ?? project.clientId !== null;

  const stored = {
    folderId: project.driveFolderId,
    internalFolderId: project.driveInternalFolderId,
    clientFolderId: project.driveClientFolderId,
    inboundFolderId: project.driveInboundFolderId,
  };
  if (project.driveFolderStatus === "ready" && isProjectFolderTreeComplete(stored, withClientFolder)) {
    return { status: "ready", folders: stored as ProjectFolderIds, created: 0 };
  }

  let created = 0;
  try {
    let folderId = stored.folderId;
    if (!folderId) {
      if (!sharedDriveId) throw new Error("GOOGLE_SHARED_DRIVE_ID no está configurado");
      folderId = (await drive.createFolder(projectFolderName(project), sharedDriveId)).id;
      created += 1;
      await db.update(projects).set({ driveFolderId: folderId }).where(eq(projects.id, projectId));
    }

    const subfolder = async (current: string | null, name: string): Promise<string> => {
      if (current) return current;
      const found = await findChildFolder(drive, folderId!, name);
      if (found) return found;
      created += 1;
      return (await drive.createFolder(name, folderId!)).id;
    };
    const folders: ProjectFolderIds = {
      folderId,
      internalFolderId: await subfolder(stored.internalFolderId, INTERNAL_FOLDER_NAME),
      clientFolderId: withClientFolder
        ? await subfolder(stored.clientFolderId, CLIENT_FOLDER_NAME)
        : stored.clientFolderId,
      inboundFolderId: withClientFolder
        ? await subfolder(stored.inboundFolderId, INBOUND_FOLDER_NAME)
        : stored.inboundFolderId,
    };

    await db
      .update(projects)
      .set({
        driveFolderId: folders.folderId,
        driveInternalFolderId: folders.internalFolderId,
        driveClientFolderId: folders.clientFolderId,
        driveInboundFolderId: folders.inboundFolderId,
        driveFolderStatus: "ready",
        driveFolderError: null,
      })
      .where(eq(projects.id, projectId));
    return { status: "ready", folders, created };
  } catch (error) {
    const message = errorMessage(error);
    await db
      .update(projects)
      .set({ driveFolderStatus: "failed", driveFolderError: message })
      .where(eq(projects.id, projectId));
    return { status: "failed", error: message };
  }
}

export type RenameProjectFolderResult =
  | { status: "renamed"; name: string }
  | { status: "unchanged" }
  | { status: "no_folder" }
  | { status: "failed"; error: string };

/**
 * Renames the project's Drive folder to `projectFolderName(project)` after a
 * name or code change. Best effort: a Drive failure is written to
 * `drive_folder_error` and returned, `drive_folder_status` is left as it is.
 * A project without a folder yet is skipped (ensureProjectFolders names it
 * when it creates it). A successful rename clears an earlier rename error on a
 * `ready` project.
 *
 * Throws ProjectNotFoundError when the project doesn't exist.
 */
export async function renameProjectFolder(
  db: ProjectFoldersDb,
  drive: DriveAdmin,
  projectId: string,
): Promise<RenameProjectFolderResult> {
  const [project] = await db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      driveFolderId: projects.driveFolderId,
      driveFolderStatus: projects.driveFolderStatus,
      driveFolderError: projects.driveFolderError,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new ProjectNotFoundError(projectId);
  if (!project.driveFolderId) return { status: "no_folder" };

  const name = projectFolderName(project);
  try {
    const current = await drive.get(project.driveFolderId, "id,name");
    let result: RenameProjectFolderResult = { status: "unchanged" };
    if (current.name !== name) {
      await drive.rename(project.driveFolderId, name);
      result = { status: "renamed", name };
    }
    if (project.driveFolderStatus === "ready" && project.driveFolderError) {
      await db.update(projects).set({ driveFolderError: null }).where(eq(projects.id, projectId));
    }
    return result;
  } catch (error) {
    const message = errorMessage(error);
    await db.update(projects).set({ driveFolderError: message }).where(eq(projects.id, projectId));
    return { status: "failed", error: message };
  }
}
