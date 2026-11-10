// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DriveAdminError, FOLDER_MIME_TYPE, type DriveFile } from "@/lib/google/drive-admin";
import {
  createProjectAncestry,
  isStaffFolderNotFound,
  loadStaffFiles,
  STAFF_ANCESTRY_CACHE_TTL_MS,
  STAFF_ANCESTRY_MAX_DEPTH,
  StaffFolderNotFoundError,
  toStaffFileItem,
  type StaffFilesDeps,
  type StaffFilesProject,
} from "@/lib/google/staff-files";

/**
 * Fake Shared Drive:
 *   shared-root
 *   ├── proj-a            (project A folder) → 01 Interno → Costos
 *   └── proj-b            (project B folder) → 02 Cliente
 */
type Node = { name: string; parent?: string; trashed?: boolean };
let tree: Record<string, Node>;

function baseTree(): Record<string, Node> {
  return {
    "shared-root": { name: "Proyectos" },
    "proj-a": { name: "P-01 · Casa", parent: "shared-root" },
    "a-interno": { name: "01 Interno", parent: "proj-a" },
    "a-costos": { name: "Costos", parent: "a-interno" },
    "a-viejo": { name: "Viejo", parent: "proj-a", trashed: true },
    "proj-b": { name: "P-02 · Depa", parent: "shared-root" },
    "b-cliente": { name: "02 Cliente", parent: "proj-b" },
  };
}

const getMock = vi.fn(async (fileId: string): Promise<DriveFile> => {
  const node = tree[fileId];
  if (!node) throw new DriveAdminError("File not found", 404, "notFound");
  return {
    id: fileId,
    name: node.name,
    mimeType: FOLDER_MIME_TYPE,
    parents: node.parent ? [node.parent] : [],
    trashed: node.trashed ?? false,
  };
});

let clock = 0;
const ancestry = () => createProjectAncestry({ getDrive: () => ({ get: getMock }), now: () => clock });

beforeEach(() => {
  tree = baseTree();
  clock = 1_000_000;
  getMock.mockClear();
});

describe("createProjectAncestry", () => {
  it("returns just the project folder for the root", async () => {
    expect(await ancestry().breadcrumbs("proj-a", "proj-a")).toEqual([{ id: "proj-a", name: "P-01 · Casa" }]);
  });

  it("returns breadcrumbs from the project folder down to a nested folder", async () => {
    expect(await ancestry().breadcrumbs("a-costos", "proj-a")).toEqual([
      { id: "proj-a", name: "P-01 · Casa" },
      { id: "a-interno", name: "01 Interno" },
      { id: "a-costos", name: "Costos" },
    ]);
  });

  it("rejects a folder of another project", async () => {
    await expect(ancestry().breadcrumbs("b-cliente", "proj-a")).rejects.toBeInstanceOf(StaffFolderNotFoundError);
  });

  it("rejects the Shared Drive root, unknown and trashed folders", async () => {
    const a = ancestry();
    await expect(a.breadcrumbs("shared-root", "proj-a")).rejects.toBeInstanceOf(StaffFolderNotFoundError);
    await expect(a.breadcrumbs("nope", "proj-a")).rejects.toBeInstanceOf(StaffFolderNotFoundError);
    await expect(a.breadcrumbs("a-viejo", "proj-a")).rejects.toBeInstanceOf(StaffFolderNotFoundError);
  });

  it("stops after the max depth", async () => {
    let parent = "proj-a";
    for (let i = 0; i < STAFF_ANCESTRY_MAX_DEPTH; i++) {
      tree[`deep-${i}`] = { name: `Nivel ${i}`, parent };
      parent = `deep-${i}`;
    }
    const a = ancestry();
    // deep-(max-2) is max-1 levels below the root: allowed.
    await expect(a.breadcrumbs(`deep-${STAFF_ANCESTRY_MAX_DEPTH - 2}`, "proj-a")).resolves.toHaveLength(
      STAFF_ANCESTRY_MAX_DEPTH
    );
    await expect(a.breadcrumbs(`deep-${STAFF_ANCESTRY_MAX_DEPTH - 1}`, "proj-a")).resolves.toHaveLength(
      STAFF_ANCESTRY_MAX_DEPTH + 1
    );
    tree[`deep-${STAFF_ANCESTRY_MAX_DEPTH}`] = { name: "Demasiado", parent };
    await expect(a.breadcrumbs(`deep-${STAFF_ANCESTRY_MAX_DEPTH}`, "proj-a")).rejects.toBeInstanceOf(
      StaffFolderNotFoundError
    );
  });

  it("caches parent lookups for 5 minutes", async () => {
    const a = ancestry();
    await a.breadcrumbs("a-costos", "proj-a");
    const calls = getMock.mock.calls.length;

    clock += STAFF_ANCESTRY_CACHE_TTL_MS - 1;
    await a.breadcrumbs("a-costos", "proj-a");
    expect(getMock.mock.calls.length).toBe(calls);

    // Moved out of the project: still allowed until the cache expires.
    tree["a-costos"].parent = "proj-b";
    await expect(a.breadcrumbs("a-costos", "proj-a")).resolves.toHaveLength(3);

    clock += 2;
    await expect(a.breadcrumbs("a-costos", "proj-a")).rejects.toBeInstanceOf(StaffFolderNotFoundError);
    expect(getMock.mock.calls.length).toBeGreaterThan(calls);
  });

  it("uses a 5 minute TTL by default", () => {
    expect(STAFF_ANCESTRY_CACHE_TTL_MS).toBe(5 * 60 * 1000);
  });

  it("does not cache a Drive outage", async () => {
    const a = ancestry();
    getMock.mockRejectedValueOnce(new DriveAdminError("Backend error", 500));
    await expect(a.breadcrumbs("a-interno", "proj-a")).rejects.toThrow("Backend error");
    await expect(a.breadcrumbs("a-interno", "proj-a")).resolves.toHaveLength(2);
  });

  it("fails without a service account", async () => {
    const a = createProjectAncestry({ getDrive: () => null });
    await expect(a.breadcrumbs("a-interno", "proj-a")).rejects.toThrow(/no está configurado/);
  });
});

describe("toStaffFileItem", () => {
  it("maps size, modifiedTime and folder kind", () => {
    expect(
      toStaffFileItem({
        id: "f1",
        name: "plano.pdf",
        mimeType: "application/pdf",
        size: "2048",
        modifiedTime: "2026-11-01T10:00:00.000Z",
        iconLink: "https://icon",
        webViewLink: "https://view",
        thumbnailLink: "https://thumb",
      })
    ).toEqual({
      id: "f1",
      name: "plano.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      modifiedAt: "2026-11-01T10:00:00.000Z",
      iconLink: "https://icon",
      webViewLink: "https://view",
      thumbnailLink: "https://thumb",
      kind: "file",
    });
    expect(toStaffFileItem({ id: "d1", name: "Renders", mimeType: FOLDER_MIME_TYPE })).toMatchObject({
      sizeBytes: null,
      iconLink: null,
      webViewLink: null,
      thumbnailLink: null,
      kind: "folder",
    });
  });
});

describe("loadStaffFiles", () => {
  const ready: StaffFilesProject = { driveFolderId: "proj-a", driveFolderStatus: "ready", driveFolderError: null };
  const listAll = vi.fn();
  const getStaffToken = vi.fn();
  const openStaffDrive = vi.fn(() => ({ listAll }));
  let deps: StaffFilesDeps;

  beforeEach(() => {
    listAll.mockReset();
    getStaffToken.mockReset();
    openStaffDrive.mockClear();
    getStaffToken.mockResolvedValue({ status: "ok", accessToken: "staff-token" });
    listAll.mockResolvedValue([]);
    deps = { ancestry: ancestry(), getStaffToken, openStaffDrive };
  });

  it("returns pending and failed with the folder error", async () => {
    expect(await loadStaffFiles({ ...ready, driveFolderStatus: "pending", driveFolderId: null }, null, deps)).toEqual({
      status: "pending",
    });
    expect(
      await loadStaffFiles({ ...ready, driveFolderStatus: "failed", driveFolderError: "quota" }, null, deps)
    ).toEqual({ status: "failed", error: "quota" });
    expect(getStaffToken).not.toHaveBeenCalled();
  });

  it("returns needs_consent without a usable Drive grant", async () => {
    getStaffToken.mockResolvedValue({ status: "needs_consent" });
    expect(await loadStaffFiles(ready, null, deps)).toEqual({ status: "needs_consent" });
    expect(listAll).not.toHaveBeenCalled();
  });

  it("returns needs_consent when Drive rejects the staff token", async () => {
    listAll.mockRejectedValue(new DriveAdminError("Invalid Credentials", 401));
    expect(await loadStaffFiles(ready, null, deps)).toEqual({ status: "needs_consent" });
  });

  it("maps Drive 403 and 404 for the user to no_drive_access", async () => {
    listAll.mockRejectedValueOnce(new DriveAdminError("Forbidden", 403, "insufficientFilePermissions"));
    expect(await loadStaffFiles(ready, null, deps)).toEqual({ status: "no_drive_access" });
    listAll.mockRejectedValueOnce(new DriveAdminError("File not found", 404, "notFound"));
    expect(await loadStaffFiles(ready, "a-interno", deps)).toEqual({ status: "no_drive_access" });
  });

  it("rethrows other Drive errors", async () => {
    listAll.mockRejectedValue(new DriveAdminError("Backend error", 500));
    await expect(loadStaffFiles(ready, null, deps)).rejects.toThrow("Backend error");
  });

  it("throws not found for a folder outside the project", async () => {
    const error = await loadStaffFiles(ready, "b-cliente", deps).catch((e: unknown) => e);
    expect(isStaffFolderNotFound(error)).toBe(true);
    expect(listAll).not.toHaveBeenCalled();
  });

  it("lists the project folder with the staff token by default, folders first", async () => {
    listAll.mockResolvedValue([
      { id: "f2", name: "presupuesto.pdf", mimeType: "application/pdf", size: "10", modifiedTime: "2026-11-02T00:00:00Z" },
      { id: "a-interno", name: "01 Interno", mimeType: FOLDER_MIME_TYPE, modifiedTime: "2026-11-01T00:00:00Z" },
      { id: "f1", name: "acta.pdf", mimeType: "application/pdf", size: "5", modifiedTime: "2026-11-02T00:00:00Z" },
    ]);

    const result = await loadStaffFiles(ready, null, deps);

    expect(openStaffDrive).toHaveBeenCalledWith("staff-token");
    expect(listAll).toHaveBeenCalledWith({
      parentId: "proj-a",
      fields: "id,name,mimeType,modifiedTime,size,iconLink,webViewLink,thumbnailLink",
    });
    expect(result).toMatchObject({
      status: "ok",
      folderId: "proj-a",
      breadcrumbs: [{ id: "proj-a", name: "P-01 · Casa" }],
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.items.map((i) => i.id)).toEqual(["a-interno", "f1", "f2"]);
    expect(result.items[1].sizeBytes).toBe(5);
  });

  it("lists a subfolder with its breadcrumbs", async () => {
    const result = await loadStaffFiles(ready, "a-costos", deps);
    expect(listAll).toHaveBeenCalledWith(expect.objectContaining({ parentId: "a-costos" }));
    expect(result).toEqual({
      status: "ok",
      folderId: "a-costos",
      breadcrumbs: [
        { id: "proj-a", name: "P-01 · Casa" },
        { id: "a-interno", name: "01 Interno" },
        { id: "a-costos", name: "Costos" },
      ],
      items: [],
    });
  });
});
