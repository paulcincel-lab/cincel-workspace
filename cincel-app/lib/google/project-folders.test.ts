// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DriveAdminError, FOLDER_MIME_TYPE, type DriveAdmin, type DriveFile, type ListOptions } from "@/lib/google/drive-admin";
import {
  ensureProjectFolders,
  ProjectNotFoundError,
  projectFolderName,
  type ProjectFoldersDb,
} from "@/lib/google/project-folders";

const SHARED_DRIVE = "shared-drive-1";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

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
};

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: PROJECT_ID,
    code: "P-01",
    name: "Casa Lomas",
    driveFolderId: null,
    driveInternalFolderId: null,
    driveClientFolderId: null,
    driveInboundFolderId: null,
    driveFolderStatus: "pending",
    driveFolderError: null,
    ...overrides,
  };
}

/** The two query shapes ensureProjectFolders uses, against one in-memory project row. */
function fakeDb(row: ProjectRow | null) {
  const updates: Partial<ProjectRow>[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (row ? [{ ...row }] : []) }),
      }),
    }),
    update: () => ({
      set: (values: Partial<ProjectRow>) => ({
        where: async () => {
          updates.push(values);
          if (row) Object.assign(row, values);
        },
      }),
    }),
  };
  return { db: db as unknown as ProjectFoldersDb, row, updates };
}

/** In-memory Drive: folders by id with their parent. */
function fakeDrive() {
  const files = new Map<string, DriveFile>();
  let next = 1;
  const calls = { createFolder: 0, list: 0 };
  let failOn: string | null = null;

  const drive = {
    async createFolder(name: string, parentId: string) {
      calls.createFolder += 1;
      if (failOn === name) throw new DriveAdminError("Insufficient permissions", 403, "insufficientFilePermissions");
      const file: DriveFile = { id: `folder-${next++}`, name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] };
      files.set(file.id, file);
      return file;
    },
    async list(options: ListOptions = {}) {
      calls.list += 1;
      const name = /name = '((?:[^'\\]|\\.)*)'/.exec(options.q ?? "")?.[1]?.replace(/\\(.)/g, "$1");
      const matches = [...files.values()].filter(
        (f) => (!options.parentId || f.parents?.includes(options.parentId)) && (!name || f.name === name) && !f.trashed,
      );
      return { files: matches };
    },
  };
  return {
    drive: drive as unknown as DriveAdmin,
    files,
    calls,
    failOn: (name: string | null) => {
      failOn = name;
    },
    childrenOf: (parentId: string) => [...files.values()].filter((f) => f.parents?.includes(parentId)),
  };
}

describe("projectFolderName", () => {
  it("joins code and name, or uses the name alone", () => {
    expect(projectFolderName({ code: "P-01", name: "Casa Lomas" })).toBe("P-01 · Casa Lomas");
    expect(projectFolderName({ code: null, name: "Casa Lomas" })).toBe("Casa Lomas");
    expect(projectFolderName({ code: "  ", name: "Casa Lomas" })).toBe("Casa Lomas");
  });

  it("replaces slashes and control characters with spaces and caps the length", () => {
    expect(projectFolderName({ code: "A/B", name: "Casa\tLomas\n2" })).toBe("A B · Casa Lomas 2");
    expect(projectFolderName({ code: null, name: "x".repeat(250) })).toHaveLength(200);
  });
});

describe("ensureProjectFolders", () => {
  it("creates one project folder and three subfolders, and running twice creates nothing more", async () => {
    const { db, row } = fakeDb(project());
    const fake = fakeDrive();

    const first = await ensureProjectFolders(db, fake.drive, PROJECT_ID, SHARED_DRIVE);
    expect(first).toMatchObject({ status: "ready", created: 4 });

    const roots = fake.childrenOf(SHARED_DRIVE);
    expect(roots.map((f) => f.name)).toEqual(["P-01 · Casa Lomas"]);
    expect(fake.childrenOf(roots[0].id).map((f) => f.name)).toEqual(["01 Interno", "02 Cliente", "03 Del cliente"]);

    const snapshot = { ...row! };
    expect(snapshot).toMatchObject({
      driveFolderId: roots[0].id,
      driveFolderStatus: "ready",
      driveFolderError: null,
    });
    expect(snapshot.driveInternalFolderId).toBeTruthy();
    expect(snapshot.driveClientFolderId).toBeTruthy();
    expect(snapshot.driveInboundFolderId).toBeTruthy();

    const second = await ensureProjectFolders(db, fake.drive, PROJECT_ID, SHARED_DRIVE);
    expect(second).toEqual({ ...first, created: 0 });
    expect(fake.files.size).toBe(4);
    expect(fake.calls.createFolder).toBe(4);
    expect(row).toEqual(snapshot);
  });

  it("reuses a stored project folder and finds existing subfolders by name", async () => {
    const fake = fakeDrive();
    const folder = await fake.drive.createFolder("P-01 · Casa Lomas", SHARED_DRIVE);
    const interno = await fake.drive.createFolder("01 Interno", folder.id);
    const { db, row } = fakeDb(project({ driveFolderId: folder.id, driveFolderStatus: "failed", driveFolderError: "boom" }));

    const result = await ensureProjectFolders(db, fake.drive, PROJECT_ID, SHARED_DRIVE);

    expect(result).toMatchObject({ status: "ready", created: 2 });
    expect(row).toMatchObject({
      driveFolderId: folder.id,
      driveInternalFolderId: interno.id,
      driveFolderStatus: "ready",
      driveFolderError: null,
    });
    expect(fake.childrenOf(SHARED_DRIVE)).toHaveLength(1);
    expect(fake.childrenOf(folder.id).map((f) => f.name).sort()).toEqual(["01 Interno", "02 Cliente", "03 Del cliente"]);
  });

  it("records a Drive failure as failed, keeps the folder id, and finishes on the next run", async () => {
    const { db, row } = fakeDb(project());
    const fake = fakeDrive();
    fake.failOn("02 Cliente");

    const failed = await ensureProjectFolders(db, fake.drive, PROJECT_ID, SHARED_DRIVE);
    expect(failed).toEqual({ status: "failed", error: "Insufficient permissions" });
    expect(row).toMatchObject({ driveFolderStatus: "failed", driveFolderError: "Insufficient permissions" });
    expect(row!.driveFolderId).toBeTruthy();

    fake.failOn(null);
    const retried = await ensureProjectFolders(db, fake.drive, PROJECT_ID, SHARED_DRIVE);
    expect(retried).toMatchObject({ status: "ready", created: 2 });
    expect(fake.childrenOf(SHARED_DRIVE)).toHaveLength(1);
    expect(fake.childrenOf(row!.driveFolderId!)).toHaveLength(3);
    expect(row).toMatchObject({ driveFolderStatus: "ready", driveFolderError: null });
  });

  it("fails without touching Drive when no Shared Drive id is given", async () => {
    const { db, row } = fakeDb(project());
    const fake = fakeDrive();

    const result = await ensureProjectFolders(db, fake.drive, PROJECT_ID, "");

    expect(result.status).toBe("failed");
    expect(fake.calls.createFolder).toBe(0);
    expect(row!.driveFolderStatus).toBe("failed");
  });

  it("throws for an unknown project", async () => {
    const { db } = fakeDb(null);
    await expect(ensureProjectFolders(db, fakeDrive().drive, PROJECT_ID, SHARED_DRIVE)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it("has no server-only import and doesn't import the app db client", () => {
    const source = readFileSync(resolve(__dirname, "project-folders.ts"), "utf8");
    expect(source).not.toMatch(/from ["']server-only["']|import ["']server-only["']/);
    expect(source).not.toMatch(/from ["'][^"']*db\/client["']/);
  });
});
