// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { DriveAdminError, FOLDER_MIME_TYPE, type DriveAdmin, type DriveFile, type ListOptions } from "@/lib/google/drive-admin";
import { renameProjectFolder, type ProjectFoldersDb } from "@/lib/google/project-folders";
import {
  DRIVE_NOT_CONFIGURED_ERROR,
  syncProjectFolderName,
  syncProjectFolders,
  type ProjectDriveDeps,
} from "@/lib/google/project-folders-app";

const SHARED_DRIVE = "shared-drive-1";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

type ProjectRow = {
  id: string;
  code: string | null;
  name: string;
  clientId: string | null;
  driveFolderId: string | null;
  driveInternalFolderId: string | null;
  driveClientFolderId: string | null;
  driveInboundFolderId: string | null;
  driveFolderStatus: "pending" | "ready" | "failed";
  driveFolderError: string | null;
};

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: PROJECT_ID,
    code: "P-07",
    name: "Casa Valle",
    clientId: "client-1",
    driveFolderId: null,
    driveInternalFolderId: null,
    driveClientFolderId: null,
    driveInboundFolderId: null,
    driveFolderStatus: "pending",
    driveFolderError: null,
    ...overrides,
  };
}

/** The select/update shapes the folder code uses, against one in-memory project row. */
function fakeDb(row: ProjectRow | null) {
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (row ? [{ ...row }] : []) }),
      }),
    }),
    update: () => ({
      set: (values: Partial<ProjectRow>) => ({
        where: async () => {
          if (row) Object.assign(row, values);
        },
      }),
    }),
  };
  return db as unknown as ProjectFoldersDb;
}

/** In-memory Drive: folders by id with their parent. */
function fakeDrive() {
  const files = new Map<string, DriveFile>();
  let next = 1;
  const calls = { createFolder: 0, rename: 0 };
  let fail = false;

  const drive = {
    async createFolder(name: string, parentId: string) {
      calls.createFolder += 1;
      if (fail) throw new DriveAdminError("Insufficient permissions", 403, "insufficientFilePermissions");
      const file: DriveFile = { id: `folder-${next++}`, name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] };
      files.set(file.id, file);
      return file;
    },
    async list(options: ListOptions = {}) {
      const name = /name = '((?:[^'\\]|\\.)*)'/.exec(options.q ?? "")?.[1]?.replace(/\\(.)/g, "$1");
      const matches = [...files.values()].filter(
        (f) => (!options.parentId || f.parents?.includes(options.parentId)) && (!name || f.name === name),
      );
      return { files: matches };
    },
    async get(fileId: string) {
      if (fail) throw new DriveAdminError("Backend error", 500);
      const file = files.get(fileId);
      if (!file) throw new DriveAdminError("File not found", 404, "notFound");
      return { ...file };
    },
    async rename(fileId: string, name: string) {
      calls.rename += 1;
      if (fail) throw new DriveAdminError("Backend error", 500);
      const file = files.get(fileId)!;
      file.name = name;
      return { ...file };
    },
  };
  return {
    drive: drive as unknown as DriveAdmin,
    files,
    calls,
    setFail: (value: boolean) => {
      fail = value;
    },
    childrenOf: (parentId: string) => [...files.values()].filter((f) => f.parents?.includes(parentId)),
  };
}

function deps(row: ProjectRow | null, drive: DriveAdmin | null, overrides: Partial<ProjectDriveDeps> = {}): ProjectDriveDeps {
  return { db: fakeDb(row), openDrive: () => drive, sharedDriveId: SHARED_DRIVE, skip: false, ...overrides };
}

describe("syncProjectFolders", () => {
  it("creates the project folder and three subfolders, and a second run creates no duplicates", async () => {
    const row = project();
    const fake = fakeDrive();

    expect(await syncProjectFolders(PROJECT_ID, deps(row, fake.drive))).toMatchObject({ status: "ready", created: 4 });
    const roots = fake.childrenOf(SHARED_DRIVE);
    expect(roots.map((f) => f.name)).toEqual(["P-07 · Casa Valle"]);
    expect(fake.childrenOf(roots[0].id).map((f) => f.name)).toEqual(["01 Interno", "02 Cliente", "03 Del cliente"]);
    expect(row).toMatchObject({ driveFolderId: roots[0].id, driveFolderStatus: "ready", driveFolderError: null });

    expect(await syncProjectFolders(PROJECT_ID, deps(row, fake.drive))).toMatchObject({ status: "ready", created: 0 });
    expect(fake.files.size).toBe(4);
    expect(fake.calls.createFolder).toBe(4);
  });

  it("records a Drive failure as failed with drive_folder_error and doesn't throw", async () => {
    const row = project();
    const fake = fakeDrive();
    fake.setFail(true);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await syncProjectFolders(PROJECT_ID, deps(row, fake.drive));
    expect(result).toEqual({ status: "failed", error: "Insufficient permissions" });
    expect(row).toMatchObject({ driveFolderStatus: "failed", driveFolderError: "Insufficient permissions" });
    error.mockRestore();
  });

  it("records a missing service account as failed", async () => {
    const row = project();
    expect(await syncProjectFolders(PROJECT_ID, deps(row, null))).toEqual({
      status: "failed",
      error: DRIVE_NOT_CONFIGURED_ERROR,
    });
    expect(row).toMatchObject({ driveFolderStatus: "failed", driveFolderError: DRIVE_NOT_CONFIGURED_ERROR });
  });

  it("does nothing with GOOGLE_FAKE (skip)", async () => {
    const row = project();
    const openDrive = vi.fn(() => null);
    expect(await syncProjectFolders(PROJECT_ID, deps(row, null, { skip: true, openDrive }))).toBeNull();
    expect(openDrive).not.toHaveBeenCalled();
    expect(row.driveFolderStatus).toBe("pending");
  });

  it("never throws, even for an unknown project", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await syncProjectFolders(PROJECT_ID, deps(null, fakeDrive().drive))).toMatchObject({ status: "failed" });
    error.mockRestore();
  });
});

describe("renameProjectFolder", () => {
  async function readyProject() {
    const row = project();
    const fake = fakeDrive();
    await syncProjectFolders(PROJECT_ID, deps(row, fake.drive));
    return { row, fake };
  }

  it("renames the folder after a name or code change", async () => {
    const { row, fake } = await readyProject();
    row.name = "Casa Valle Alto";
    row.code = "P-08";

    expect(await renameProjectFolder(fakeDb(row), fake.drive, PROJECT_ID)).toEqual({
      status: "renamed",
      name: "P-08 · Casa Valle Alto",
    });
    expect(fake.files.get(row.driveFolderId!)!.name).toBe("P-08 · Casa Valle Alto");
  });

  it("applies the folder name rules", async () => {
    const { row, fake } = await readyProject();
    row.code = null;
    row.name = "Casa/Valle";
    await renameProjectFolder(fakeDb(row), fake.drive, PROJECT_ID);
    expect(fake.files.get(row.driveFolderId!)!.name).toBe("Casa Valle");
  });

  it("doesn't call rename when the name already matches", async () => {
    const { row, fake } = await readyProject();
    expect(await renameProjectFolder(fakeDb(row), fake.drive, PROJECT_ID)).toEqual({ status: "unchanged" });
    expect(fake.calls.rename).toBe(0);
  });

  it("skips a project without a folder", async () => {
    const row = project();
    const fake = fakeDrive();
    expect(await renameProjectFolder(fakeDb(row), fake.drive, PROJECT_ID)).toEqual({ status: "no_folder" });
  });

  it("records a failure in drive_folder_error and keeps the status ready, then clears it on success", async () => {
    const { row, fake } = await readyProject();
    row.name = "Otro nombre";
    fake.setFail(true);

    expect(await renameProjectFolder(fakeDb(row), fake.drive, PROJECT_ID)).toEqual({
      status: "failed",
      error: "Backend error",
    });
    expect(row).toMatchObject({ driveFolderStatus: "ready", driveFolderError: "Backend error" });

    fake.setFail(false);
    expect(await renameProjectFolder(fakeDb(row), fake.drive, PROJECT_ID)).toMatchObject({ status: "renamed" });
    expect(row).toMatchObject({ driveFolderStatus: "ready", driveFolderError: null });
  });
});

describe("syncProjectFolderName", () => {
  it("does nothing when Drive isn't configured or GOOGLE_FAKE is on", async () => {
    const row = project({ driveFolderId: "folder-x", driveFolderStatus: "ready" });
    expect(await syncProjectFolderName(PROJECT_ID, deps(row, null))).toBeNull();
    expect(await syncProjectFolderName(PROJECT_ID, deps(row, fakeDrive().drive, { skip: true }))).toBeNull();
  });

  it("never throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await syncProjectFolderName(PROJECT_ID, deps(null, fakeDrive().drive))).toMatchObject({ status: "failed" });
    error.mockRestore();
  });
});
