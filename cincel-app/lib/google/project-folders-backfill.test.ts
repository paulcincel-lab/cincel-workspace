// @vitest-environment node
import { Column, is, Param, SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { DriveAdminError, FOLDER_MIME_TYPE, type DriveAdmin, type DriveFile, type ListOptions } from "@/lib/google/drive-admin";
import type { ProjectFoldersDb } from "@/lib/google/project-folders";
import {
  DRIVE_DISABLED_ERROR,
  ensureMissingProjectFolders,
  retryProjectFolders,
  type ProjectDriveDeps,
} from "@/lib/google/project-folders-app";

const SHARED_DRIVE = "shared-drive-1";

type ProjectRow = {
  id: string;
  code: string | null;
  name: string;
  driveFolderId: string | null;
  driveInternalFolderId: string | null;
  driveClientFolderId: string | null;
  driveInboundFolderId: string | null;
  driveFolderStatus: "pending" | "ready" | "failed";
  driveFolderError: string | null;
  deletedAt: Date | null;
};

let nextId = 1;
function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  const n = nextId++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    code: `P-${n}`,
    name: `Proyecto ${n}`,
    driveFolderId: null,
    driveInternalFolderId: null,
    driveClientFolderId: null,
    driveInboundFolderId: null,
    driveFolderStatus: "pending",
    driveFolderError: null,
    deletedAt: null,
    ...overrides,
  };
}

/** The string params and column names a drizzle condition mentions. */
function inspect(condition: unknown, out = { params: new Set<unknown>(), columns: new Set<string>() }) {
  if (Array.isArray(condition)) condition.forEach((c) => inspect(c, out));
  else if (is(condition, SQL)) condition.queryChunks.forEach((c) => inspect(c, out));
  else if (is(condition, Param)) inspect(condition.value, out);
  else if (is(condition, Column)) out.columns.add(condition.name);
  else if (typeof condition === "string") out.params.add(condition);
  return out;
}

/**
 * In-memory projects table for the select/update shapes the folder code uses.
 * A condition matches a row when it names the row's id (or, with no id, its
 * status), and skips soft-deleted rows when it mentions `deleted_at`.
 */
function fakeDb(rows: ProjectRow[]) {
  const matches = (condition: unknown) => {
    const { params, columns } = inspect(condition);
    const ids = rows.filter((r) => params.has(r.id));
    const picked = ids.length || columns.has("id") ? ids : rows.filter((r) => params.has(r.driveFolderStatus));
    return columns.has("deleted_at") ? picked.filter((r) => !r.deletedAt) : picked;
  };
  const db = {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => ({
          limit: async () => matches(condition).map((r) => ({ ...r })),
          orderBy: async () => matches(condition).map((r) => ({ id: r.id })),
        }),
      }),
    }),
    update: () => ({
      set: (values: Partial<ProjectRow>) => ({
        where: async (condition: unknown) => {
          for (const row of matches(condition)) Object.assign(row, values);
        },
      }),
    }),
  };
  return db as unknown as ProjectFoldersDb;
}

/** In-memory Drive; `failFor` names projects whose folder create fails. */
function fakeDrive(failFor = new Set<string>()) {
  const files = new Map<string, DriveFile>();
  let next = 1;
  const drive = {
    async createFolder(name: string, parentId: string) {
      if (failFor.has(name)) throw new DriveAdminError("Insufficient permissions", 403, "insufficientFilePermissions");
      const file: DriveFile = { id: `folder-${next++}`, name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] };
      files.set(file.id, file);
      return file;
    },
    async list(options: ListOptions = {}) {
      const name = /name = '((?:[^'\\]|\\.)*)'/.exec(options.q ?? "")?.[1]?.replace(/\\(.)/g, "$1");
      const found = [...files.values()].filter(
        (f) => (!options.parentId || f.parents?.includes(options.parentId)) && (!name || f.name === name),
      );
      return { files: found };
    },
  };
  return { drive: drive as unknown as DriveAdmin, files, failFor };
}

function deps(rows: ProjectRow[], drive: DriveAdmin | null, overrides: Partial<ProjectDriveDeps> = {}): ProjectDriveDeps {
  return { db: fakeDb(rows), openDrive: () => drive, sharedDriveId: SHARED_DRIVE, skip: false, ...overrides };
}

describe("retryProjectFolders", () => {
  it("fixes a failed project and clears the error", async () => {
    const row = project({ driveFolderStatus: "failed", driveFolderError: "Insufficient permissions" });
    const fake = fakeDrive();

    expect(await retryProjectFolders(row.id, deps([row], fake.drive))).toEqual({ status: "ready" });
    expect(row).toMatchObject({ driveFolderStatus: "ready", driveFolderError: null });
    expect(row.driveFolderId).toBeTruthy();
    expect(fake.files.size).toBe(4);
  });

  it("only creates the missing subfolders when the project folder exists", async () => {
    const row = project({ driveFolderStatus: "failed", driveFolderError: "Backend error" });
    const fake = fakeDrive();
    const parent = await fake.drive.createFolder("P-x · existente", SHARED_DRIVE);
    await fake.drive.createFolder("01 Interno", parent.id);
    row.driveFolderId = parent.id;

    expect(await retryProjectFolders(row.id, deps([row], fake.drive))).toEqual({ status: "ready" });
    expect(fake.files.size).toBe(4);
    expect(row.driveFolderId).toBe(parent.id);
  });

  it("reports a Drive failure and keeps it on the project", async () => {
    const row = project();
    const fake = fakeDrive(new Set([`${row.code} · ${row.name}`]));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await retryProjectFolders(row.id, deps([row], fake.drive))).toEqual({
      status: "failed",
      error: "Insufficient permissions",
    });
    expect(row).toMatchObject({ driveFolderStatus: "failed", driveFolderError: "Insufficient permissions" });
    error.mockRestore();
  });

  it("is not_found for an unknown or soft-deleted project", async () => {
    const deleted = project({ deletedAt: new Date() });
    const fake = fakeDrive();
    expect(await retryProjectFolders(project().id, deps([deleted], fake.drive))).toEqual({ status: "not_found" });
    expect(await retryProjectFolders(deleted.id, deps([deleted], fake.drive))).toEqual({ status: "not_found" });
    expect(fake.files.size).toBe(0);
  });

  it("reports failed without touching the row when Drive is off (GOOGLE_FAKE)", async () => {
    const row = project({ driveFolderStatus: "failed", driveFolderError: "x" });
    expect(await retryProjectFolders(row.id, deps([row], null, { skip: true }))).toEqual({
      status: "failed",
      error: DRIVE_DISABLED_ERROR,
    });
    expect(row).toMatchObject({ driveFolderStatus: "failed", driveFolderError: "x" });
  });
});

describe("ensureMissingProjectFolders", () => {
  it("fills pending and failed projects and reports created, skipped and failed counts", async () => {
    const pending = project();
    const failed = project({ driveFolderStatus: "failed", driveFolderError: "Backend error" });
    const broken = project();
    const fake = fakeDrive(new Set([`${broken.code} · ${broken.name}`]));
    // Folders already complete in Drive; only the status is stale.
    const parent = await fake.drive.createFolder("Completo", SHARED_DRIVE);
    const stale = project({
      driveFolderId: parent.id,
      driveInternalFolderId: (await fake.drive.createFolder("01 Interno", parent.id)).id,
      driveClientFolderId: (await fake.drive.createFolder("02 Cliente", parent.id)).id,
      driveInboundFolderId: (await fake.drive.createFolder("03 Del cliente", parent.id)).id,
    });
    const ready = project({ driveFolderStatus: "ready", driveFolderId: "ready-folder" });
    const deleted = project({ deletedAt: new Date() });
    const rows = [pending, failed, broken, stale, ready, deleted];
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await ensureMissingProjectFolders(deps(rows, fake.drive))).toEqual({ created: 2, skipped: 1, failed: 1 });
    expect(pending).toMatchObject({ driveFolderStatus: "ready", driveFolderError: null });
    expect(failed).toMatchObject({ driveFolderStatus: "ready", driveFolderError: null });
    expect(stale).toMatchObject({ driveFolderStatus: "ready", driveFolderId: parent.id });
    expect(broken).toMatchObject({ driveFolderStatus: "failed", driveFolderError: "Insufficient permissions" });
    expect(ready).toMatchObject({ driveFolderStatus: "ready", driveFolderId: "ready-folder" });
    expect(deleted).toMatchObject({ driveFolderStatus: "pending", driveFolderId: null });
    error.mockRestore();
  });

  it("returns zero counts when nothing is missing", async () => {
    const rows = [project({ driveFolderStatus: "ready", driveFolderId: "f" })];
    expect(await ensureMissingProjectFolders(deps(rows, fakeDrive().drive))).toEqual({
      created: 0,
      skipped: 0,
      failed: 0,
    });
  });

  it("counts every project as skipped when Drive is off (GOOGLE_FAKE)", async () => {
    const rows = [project(), project({ driveFolderStatus: "failed" })];
    expect(await ensureMissingProjectFolders(deps(rows, null, { skip: true }))).toEqual({
      created: 0,
      skipped: 2,
      failed: 0,
    });
    expect(rows.map((r) => r.driveFolderStatus)).toEqual(["pending", "failed"]);
  });
});
