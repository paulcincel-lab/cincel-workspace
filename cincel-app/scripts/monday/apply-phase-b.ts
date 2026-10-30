/**
 * Phase B of `apply` (docs/specs/monday-migration/backend.md §7, §10,
 * §12 #10, #11): Drive folders and file uploads for one `applying` batch.
 * Idempotent and resumable; a re-run picks up where the last one stopped.
 *
 * 1. Every project of the batch (its project import refs, plus the projects
 *    its `import_files` point at) gets `ensureProjectFolders` (a project
 *    whose `drive_folder_id` is set keeps its root folder) and
 *    `01 Interno/Importado de monday`, stored in `drive_import_folder_id`.
 *    The project's `import_refs.row_updated_at` is refreshed afterwards so
 *    the rollback change check doesn't count these writes as edits.
 * 2. Every pending `import_files` row (`drive_file_id` null) goes to
 *    `Importado de monday/<group name>` (the import folder itself when the
 *    file has no group) by resumable upload from the export folder. Its DB
 *    writes run in one transaction: `drive_files`, a `task_links` or
 *    `project_links` row (`kind = 'interno'`), their import refs and
 *    `import_files.drive_file_id`. A file uploaded by a run that died before
 *    that transaction is found again in its folder (same name and size, not
 *    claimed by any row) and reused instead of uploaded twice.
 * 3. With nothing pending, `import_batches.status = applied` and
 *    `stats.drive`; otherwise the batch stays `applying` and the next
 *    `apply` resumes it.
 *
 * Nothing is ever written to `02 Cliente`; staff move client files there.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { Readable } from "node:stream";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import {
  driveFiles,
  importBatches,
  importFiles,
  importRefs,
  projectLinks,
  projects,
  taskLinks,
} from "../../lib/db/schema";
import {
  escapeQueryValue,
  FOLDER_MIME_TYPE,
  type DriveAdmin,
  type DriveFile,
} from "../../lib/google/drive-admin";
import { driveWebViewLink } from "../../lib/google/drive-url";
import {
  ensureProjectFolders,
  projectFolderName,
  type ProjectFoldersDb,
} from "../../lib/google/project-folders";
import { insertImportRefs, type ImportDb } from "../../lib/import/refs";
import type { PhaseB, PhaseBContext } from "./apply";

export const IMPORT_FOLDER_NAME = "Importado de monday";

const SOURCE = "monday";

/** Fields phase B needs back from Drive for a file. */
const FILE_FIELDS =
  "id,name,mimeType,parents,size,webViewLink,iconLink,thumbnailLink";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".dwg": "image/vnd.dwg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

/** The upload MIME type for a file name; `application/octet-stream` when unknown. */
export function mimeTypeFor(fileName: string): string {
  return (
    MIME_TYPES[extname(fileName).toLowerCase()] ?? "application/octet-stream"
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/** The first folder named `name` directly under `parentId`, if any. */
async function findChildFolder(
  drive: DriveAdmin,
  parentId: string,
  name: string,
): Promise<string | null> {
  const { files } = await drive.list({
    parentId,
    q: `name = '${escapeQueryValue(name)}' and mimeType = '${FOLDER_MIME_TYPE}'`,
    pageSize: 10,
    fields: "id,name,mimeType",
  });
  return files[0]?.id ?? null;
}

async function ensureChildFolder(
  drive: DriveAdmin,
  parentId: string,
  name: string,
  onCreate: () => void,
): Promise<string> {
  const found = await findChildFolder(drive, parentId, name);
  if (found) return found;
  onCreate();
  return (await drive.createFolder(name, parentId)).id;
}

/** Sets `row_updated_at` of a project's import refs to its current `updated_at`. */
async function refreshProjectRefs(db: ImportDb, projectId: string) {
  await db
    .update(importRefs)
    .set({
      rowUpdatedAt: sql`(select ${projects.updatedAt} from ${projects} where ${projects.id} = ${projectId})`,
    })
    .where(
      and(
        eq(importRefs.source, SOURCE),
        eq(importRefs.entity, "project"),
        eq(importRefs.rowId, projectId),
      ),
    );
}

/** What one phase B run did. */
export interface PhaseBResult {
  projects: number;
  /** Projects whose folders failed; their files stay pending. */
  failedProjects: { projectId: string; error: string }[];
  foldersCreated: number;
  uploaded: number;
  /** Files a previous run uploaded but didn't record, found and reused. */
  reused: number;
  failedFiles: { assetId: string; fileName: string; error: string }[];
  /** Files still without a Drive id after this run. */
  pending: number;
}

/**
 * Runs phase B for `batchId`. Folder and upload failures are recorded and
 * returned, not thrown (`projects.drive_folder_error`, `import_files.error`).
 */
export async function runPhaseB(
  db: ImportDb,
  drive: DriveAdmin,
  sharedDriveId: string,
  batchId: string,
  exportDir: string,
): Promise<PhaseBResult> {
  const [batch] = await db
    .select({
      appliedById: importBatches.appliedById,
      status: importBatches.status,
    })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  if (!batch) throw new Error(`import batch ${batchId} not found`);
  if (batch.status !== "applying")
    throw new Error(`import batch ${batchId} is ${batch.status}, not applying`);

  const result: PhaseBResult = {
    projects: 0,
    failedProjects: [],
    foldersCreated: 0,
    uploaded: 0,
    reused: 0,
    failedFiles: [],
    pending: 0,
  };

  const projectIds = (
    (await db.execute(
      sql`select row_id::text as id from core.import_refs
            where batch_id = ${batchId} and source = ${SOURCE} and entity = 'project'
          union
          select project_id::text from core.import_files where batch_id = ${batchId}
          order by 1`,
    )) as unknown as { id: string }[]
  ).map((r) => r.id);
  result.projects = projectIds.length;

  for (const projectId of projectIds) {
    // --- folders ------------------------------------------------------------
    const ensured = await ensureProjectFolders(
      db as ProjectFoldersDb,
      drive,
      projectId,
      sharedDriveId,
    );
    if (ensured.status === "failed") {
      await refreshProjectRefs(db, projectId);
      result.failedProjects.push({ projectId, error: ensured.error });
      continue;
    }
    result.foldersCreated += ensured.created;

    let importFolderId: string;
    try {
      const [row] = await db
        .select({ id: projects.driveImportFolderId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      importFolderId =
        row?.id ??
        (await ensureChildFolder(
          drive,
          ensured.folders.internalFolderId,
          IMPORT_FOLDER_NAME,
          () => result.foldersCreated++,
        ));
      if (!row?.id)
        await db
          .update(projects)
          .set({ driveImportFolderId: importFolderId })
          .where(eq(projects.id, projectId));
    } catch (err) {
      const error = errorMessage(err);
      await db
        .update(projects)
        .set({ driveFolderStatus: "failed", driveFolderError: error })
        .where(eq(projects.id, projectId));
      await refreshProjectRefs(db, projectId);
      result.failedProjects.push({ projectId, error });
      continue;
    }
    await refreshProjectRefs(db, projectId);

    // --- files --------------------------------------------------------------
    const pending = await db
      .select()
      .from(importFiles)
      .where(
        and(
          eq(importFiles.batchId, batchId),
          eq(importFiles.projectId, projectId),
          isNull(importFiles.driveFileId),
        ),
      )
      .orderBy(asc(importFiles.assetId));

    const groupFolders = new Map<string, Promise<string>>();
    const folderFor = (groupName: string | null): Promise<string> => {
      const name = groupName
        ? projectFolderName({ code: null, name: groupName })
        : "";
      if (!name) return Promise.resolve(importFolderId);
      let folder = groupFolders.get(name);
      if (!folder) {
        folder = ensureChildFolder(
          drive,
          importFolderId,
          name,
          () => result.foldersCreated++,
        );
        groupFolders.set(name, folder);
        folder.catch(() => groupFolders.delete(name));
      }
      return folder;
    };

    for (const file of pending) {
      try {
        const parentId = await folderFor(file.groupName);
        const path = join(exportDir, file.localPath);
        const { size } = await stat(path);

        let uploaded = await findOrphanUpload(
          db,
          drive,
          parentId,
          file.fileName,
          size,
        );
        if (uploaded) result.reused++;
        else {
          uploaded = await drive.uploadResumable({
            name: file.fileName,
            parentId,
            mimeType: mimeTypeFor(file.fileName),
            body: Readable.toWeb(
              createReadStream(path),
            ) as ReadableStream<Uint8Array>,
            size,
            fields: FILE_FIELDS,
          });
          result.uploaded++;
        }
        await recordUpload(db, batchId, batch.appliedById, file, uploaded);
      } catch (err) {
        const error = errorMessage(err);
        await db
          .update(importFiles)
          .set({ error })
          .where(eq(importFiles.id, file.id));
        result.failedFiles.push({
          assetId: file.assetId,
          fileName: file.fileName,
          error,
        });
      }
    }
  }

  // --- batch status, stats ---------------------------------------------------
  const [counts] = (await db.execute(
    sql`select count(*) filter (where drive_file_id is null)::int as pending,
               count(*) filter (where drive_file_id is not null)::int as uploaded
          from core.import_files where batch_id = ${batchId}`,
  )) as unknown as { pending: number; uploaded: number }[];
  result.pending = counts.pending;
  const done = result.pending === 0 && result.failedProjects.length === 0;
  const driveStats = {
    projects: result.projects,
    files: counts.uploaded,
    pending: counts.pending,
    failedProjects: result.failedProjects.length,
  };
  await db
    .update(importBatches)
    .set({
      stats: sql`${importBatches.stats} || jsonb_build_object('drive', ${JSON.stringify(driveStats)}::jsonb)`,
      ...(done ? { status: "applied" as const } : {}),
    })
    .where(eq(importBatches.id, batchId));

  return result;
}

/**
 * A file in `parentId` named `name` with `size` bytes that no `import_files`
 * or `drive_files` row claims: the upload of a run that died before
 * recording it.
 */
async function findOrphanUpload(
  db: ImportDb,
  drive: DriveAdmin,
  parentId: string,
  name: string,
  size: number,
): Promise<DriveFile | null> {
  const files = await drive.listAll({
    parentId,
    q: `name = '${escapeQueryValue(name)}' and mimeType != '${FOLDER_MIME_TYPE}'`,
    fields: FILE_FIELDS,
  });
  for (const f of files) {
    if (f.size !== undefined && Number(f.size) !== size) continue;
    const claimed = (await db.execute(
      sql`select 1 from core.import_files where drive_file_id = ${f.id}
          union all
          select 1 from core.drive_files where google_file_id = ${f.id}
          limit 1`,
    )) as unknown as unknown[];
    if (claimed.length === 0) return f;
  }
  return null;
}

/** The DB writes of one uploaded file, in one transaction. */
async function recordUpload(
  db: ImportDb,
  batchId: string,
  createdById: string,
  file: typeof importFiles.$inferSelect,
  uploaded: DriveFile,
): Promise<void> {
  const url = uploaded.webViewLink ?? driveWebViewLink(uploaded.id, false);
  await db.transaction(async (tx) => {
    const [df] = await tx
      .insert(driveFiles)
      .values({
        googleFileId: uploaded.id,
        fileName: uploaded.name ?? file.fileName,
        mimeType: uploaded.mimeType ?? mimeTypeFor(file.fileName),
        iconLink: uploaded.iconLink ?? null,
        thumbnailLink: uploaded.thumbnailLink ?? null,
        webViewLink: url,
        syncedAt: new Date(),
      })
      .returning({ id: driveFiles.id, updatedAt: driveFiles.updatedAt });

    const link = file.taskId
      ? {
          entity: "task_link" as const,
          row: (
            await tx
              .insert(taskLinks)
              .values({
                taskId: file.taskId,
                kind: "interno",
                title: file.fileName,
                url,
                createdById,
              })
              .returning({ id: taskLinks.id, updatedAt: taskLinks.updatedAt })
          )[0],
        }
      : {
          entity: "project_link" as const,
          row: (
            await tx
              .insert(projectLinks)
              .values({
                projectId: file.projectId,
                kind: "interno",
                title: file.fileName,
                url,
                driveFileId: df.id,
              })
              .returning({
                id: projectLinks.id,
                updatedAt: projectLinks.updatedAt,
              })
          )[0],
        };

    await insertImportRefs(tx, [
      {
        source: SOURCE,
        entity: "drive_file",
        externalId: file.assetId,
        rowId: df.id,
        batchId,
        rowUpdatedAt: df.updatedAt,
      },
      {
        source: SOURCE,
        entity: link.entity,
        externalId: file.assetId,
        rowId: link.row.id,
        batchId,
        rowUpdatedAt: link.row.updatedAt,
      },
    ]);
    await tx
      .update(importFiles)
      .set({ driveFileId: uploaded.id, error: null })
      .where(eq(importFiles.id, file.id));
  });
}

type Env = Record<string, string | undefined>;

export interface PhaseBDeps {
  openDrive: () => DriveAdmin;
  env?: Env;
}

function report(ctx: PhaseBContext, r: PhaseBResult): number {
  const { io, batchId } = ctx;
  io.stdout(
    `Phase B: ${r.projects} projects, ${r.foldersCreated} folders created, ${r.uploaded} files uploaded, ${r.reused} reused from an interrupted run, ${r.pending} pending.\n`,
  );
  for (const p of r.failedProjects)
    io.stderr(`monday apply: project ${p.projectId} folders: ${p.error}\n`);
  for (const f of r.failedFiles)
    io.stderr(
      `monday apply: file ${f.assetId} ("${f.fileName}"): ${f.error}\n`,
    );
  if (r.pending > 0 || r.failedProjects.length > 0) {
    io.stderr(
      `monday apply: batch ${batchId} stays applying; run the same apply again to resume phase B.\n`,
    );
    return 1;
  }
  io.stdout(`Batch ${batchId} applied.\n`);
  return 0;
}

/** Builds phase B over a Drive client and `GOOGLE_SHARED_DRIVE_ID`. */
export function createPhaseB(deps: PhaseBDeps): PhaseB {
  return async (ctx) => {
    const { io, batchId } = ctx;
    const sharedDriveId = (
      deps.env ?? process.env
    ).GOOGLE_SHARED_DRIVE_ID?.trim();
    let drive: DriveAdmin;
    try {
      if (!sharedDriveId) throw new Error("GOOGLE_SHARED_DRIVE_ID is not set");
      drive = deps.openDrive();
    } catch (err) {
      io.stderr(
        `monday apply: phase B can't start: ${errorMessage(err)}. Batch ${batchId} stays applying; fix it and run the same apply again.\n`,
      );
      return 1;
    }
    const result = await runPhaseB(
      ctx.db,
      drive,
      sharedDriveId,
      batchId,
      ctx.exportDir,
    );
    return report(ctx, result);
  };
}
