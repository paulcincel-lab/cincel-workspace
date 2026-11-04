// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DriveAdminError, FOLDER_MIME_TYPE, type DriveFile, type ListOptions } from "@/lib/google/drive-admin";
import { createDriveGuard, isPortalNotFound, PortalNotFoundError } from "@/lib/portal/drive-guard";
import {
  createPortalFileLister,
  PORTAL_LIST_CACHE_TTL_MS,
  PORTAL_LIST_FIELDS,
  PORTAL_ROOT_BREADCRUMB,
  PortalDriveUnavailableError,
  SHORTCUT_MIME_TYPE,
  toPortalFileDTO,
} from "@/lib/portal/files";

/**
 * Fake Shared Drive:
 *   proj-a
 *   ├── a-interno   (01 Interno)  → costos.pdf
 *   └── a-cliente   (02 Cliente)  → plano.pdf, Renders/ → nested.pdf, Memoria (Doc),
 *                                   atajo (shortcut), Encuesta (Form)
 *   proj-b
 *   └── b-cliente   (02 Cliente)  → b-plano.pdf
 */
type Node = { name: string; parent?: string; mimeType?: string; size?: string; trashed?: boolean } & Record<
  string,
  unknown
>;
let tree: Record<string, Node>;

function baseTree(): Record<string, Node> {
  return {
    "proj-a": { name: "P-01 · Casa", mimeType: FOLDER_MIME_TYPE },
    "a-interno": { name: "01 Interno", parent: "proj-a", mimeType: FOLDER_MIME_TYPE },
    "a-secret": { name: "costos.pdf", parent: "a-interno", mimeType: "application/pdf", size: "10" },
    "a-cliente": { name: "02 Cliente", parent: "proj-a", mimeType: FOLDER_MIME_TYPE },
    plano: {
      name: "plano.pdf",
      parent: "a-cliente",
      mimeType: "application/pdf",
      size: "2048",
      // Fields a careless Drive call could return; the portal must never pass them on.
      webViewLink: "https://drive.google.com/file/d/plano/view",
      webContentLink: "https://drive.google.com/uc?id=plano",
      owners: [{ emailAddress: "staff@cincel.mx" }],
      permissions: [{ role: "writer" }],
    },
    sub: { name: "Renders", parent: "a-cliente", mimeType: FOLDER_MIME_TYPE },
    nested: { name: "nested.pdf", parent: "sub", mimeType: "application/pdf", size: "5" },
    memoria: { name: "Memoria", parent: "a-cliente", mimeType: "application/vnd.google-apps.document" },
    atajo: { name: "atajo", parent: "a-cliente", mimeType: SHORTCUT_MIME_TYPE },
    encuesta: { name: "Encuesta", parent: "a-cliente", mimeType: "application/vnd.google-apps.form" },
    viejo: { name: "viejo.pdf", parent: "a-cliente", mimeType: "application/pdf", trashed: true },
    "proj-b": { name: "P-02 · Depa", mimeType: FOLDER_MIME_TYPE },
    "b-cliente": { name: "02 Cliente", parent: "proj-b", mimeType: FOLDER_MIME_TYPE },
    "b-plano": { name: "b-plano.pdf", parent: "b-cliente", mimeType: "application/pdf" },
  };
}

function asDriveFile(id: string, node: Node): DriveFile {
  const { parent, ...rest } = node;
  return { ...rest, id, parents: parent ? [parent] : [], modifiedTime: "2026-11-01T10:00:00.000Z" } as DriveFile;
}

const get = vi.fn<(fileId: string, fields?: string) => Promise<DriveFile>>();
const listAll = vi.fn<(options?: Omit<ListOptions, "pageToken">) => Promise<DriveFile[]>>();
let clock = 0;

function lister(options: { drive?: boolean } = {}) {
  const guard = createDriveGuard({ getDrive: () => ({ get }), now: () => clock });
  return createPortalFileLister({
    getDrive: () => (options.drive === false ? null : { listAll }),
    guard,
    now: () => clock,
  });
}

const projectA = { driveClientFolderId: "a-cliente" };

beforeEach(() => {
  tree = baseTree();
  clock = 1_000_000;
  get.mockReset();
  listAll.mockReset();
  get.mockImplementation(async (fileId) => {
    const node = tree[fileId];
    if (!node) throw new DriveAdminError("File not found", 404, "notFound");
    return asDriveFile(fileId, node);
  });
  // Mirrors files.list: direct children, trashed left out; returns whatever fields the node has.
  listAll.mockImplementation(async (options) =>
    Object.entries(tree)
      .filter(([, node]) => node.parent === options?.parentId && !node.trashed)
      .map(([id, node]) => asDriveFile(id, node))
  );
});

describe("listFolder", () => {
  it("lists the client folder by default with only the safe fields", async () => {
    const listing = await lister().listFolder(projectA);

    expect(listing.folderId).toBe("a-cliente");
    expect(listing.breadcrumbs).toEqual([{ id: "a-cliente", name: PORTAL_ROOT_BREADCRUMB }]);
    expect(listing.items.map((item) => item.id)).toEqual(["sub", "memoria", "plano"]);
    expect(listAll).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "a-cliente", fields: PORTAL_LIST_FIELDS })
    );
    expect(PORTAL_LIST_FIELDS).toBe("id,name,mimeType,size,modifiedTime");

    const plano = listing.items.find((item) => item.id === "plano");
    expect(plano).toEqual({
      id: "plano",
      name: "plano.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      modifiedAt: "2026-11-01T10:00:00.000Z",
      kind: "file",
      deliveredAs: "original",
    });
    const body = JSON.stringify(listing);
    for (const forbidden of ["webViewLink", "webContentLink", "owners", "permissions", "staff@cincel.mx"]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("omits shortcuts and native types that can't be exported; flags Docs as pdf", async () => {
    const { items } = await lister().listFolder(projectA);

    expect(items.some((item) => item.id === "atajo")).toBe(false);
    expect(items.some((item) => item.id === "encuesta")).toBe(false);
    const memoria = items.find((item) => item.id === "memoria");
    expect(memoria).toMatchObject({ kind: "file", deliveredAs: "pdf", sizeBytes: null });
    const sub = items.find((item) => item.id === "sub");
    expect(sub).toMatchObject({ kind: "folder", deliveredAs: "original", sizeBytes: null });
    expect(listAll.mock.calls[0][0]?.q).toContain(SHORTCUT_MIME_TYPE);
  });

  it("lists a nested folder with breadcrumbs from the client folder down", async () => {
    const listing = await lister().listFolder(projectA, "sub");

    expect(listing.folderId).toBe("sub");
    expect(listing.breadcrumbs).toEqual([
      { id: "a-cliente", name: PORTAL_ROOT_BREADCRUMB },
      { id: "sub", name: "Renders" },
    ]);
    expect(listing.items.map((item) => item.id)).toEqual(["nested"]);
  });

  it.each([
    ["01 Interno", "a-interno"],
    ["the project folder", "proj-a"],
    ["another project's client folder", "b-cliente"],
    ["an unknown id", "nope"],
  ])("answers 404 for %s and never lists it", async (_label, folderId) => {
    const error = await lister()
      .listFolder(projectA, folderId)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PortalNotFoundError);
    expect(isPortalNotFound(error)).toBe(true);
    expect(listAll).not.toHaveBeenCalled();
  });

  it("answers 404 when the project has no client folder", async () => {
    await expect(lister().listFolder({ driveClientFolderId: null })).rejects.toBeInstanceOf(PortalNotFoundError);
    expect(listAll).not.toHaveBeenCalled();
  });

  it("throws PortalDriveUnavailableError when the service account isn't configured", async () => {
    await expect(lister({ drive: false }).listFolder(projectA)).rejects.toBeInstanceOf(PortalDriveUnavailableError);
  });

  it("caches a folder for 60 s, so a new file shows up after the TTL", async () => {
    const files = lister();
    await files.listFolder(projectA);

    tree.nuevo = { name: "nuevo.pdf", parent: "a-cliente", mimeType: "application/pdf", size: "1" };
    clock += PORTAL_LIST_CACHE_TTL_MS - 1;
    const cached = await files.listFolder(projectA);
    expect(cached.items.some((item) => item.id === "nuevo")).toBe(false);
    expect(listAll).toHaveBeenCalledTimes(1);

    clock += 1;
    const fresh = await files.listFolder(projectA);
    expect(fresh.items.some((item) => item.id === "nuevo")).toBe(true);
    expect(listAll).toHaveBeenCalledTimes(2);
  });

  it("still checks ancestry on a cached folder", async () => {
    const files = lister();
    await files.listFolder(projectA, "sub");
    await expect(files.listFolder({ driveClientFolderId: "b-cliente" }, "sub")).rejects.toBeInstanceOf(
      PortalNotFoundError
    );
    expect(listAll).toHaveBeenCalledTimes(1);
  });

  it("drops the oldest folder when the cache is full", async () => {
    const guard = { assertInsideClientFolder: vi.fn(async () => []) };
    const files = createPortalFileLister({ getDrive: () => ({ listAll }), guard, maxEntries: 1, now: () => clock });
    await files.listFolder(projectA, "a-cliente");
    await files.listFolder(projectA, "sub");
    await files.listFolder(projectA, "a-cliente");
    expect(listAll).toHaveBeenCalledTimes(3);
  });

  it("doesn't cache a Drive error", async () => {
    const files = lister();
    listAll.mockRejectedValueOnce(new DriveAdminError("Backend error", 500));
    await expect(files.listFolder(projectA)).rejects.toBeInstanceOf(DriveAdminError);
    await expect(files.listFolder(projectA)).resolves.toMatchObject({ folderId: "a-cliente" });
    expect(listAll).toHaveBeenCalledTimes(2);
  });
});

describe("toPortalFileDTO", () => {
  it("flags Sheets, Slides and Drawings as pdf", () => {
    for (const type of ["spreadsheet", "presentation", "drawing"]) {
      const dto = toPortalFileDTO({ id: type, name: type, mimeType: `application/vnd.google-apps.${type}` });
      expect(dto?.deliveredAs).toBe("pdf");
    }
  });

  it("drops shortcuts and non-exportable native types", () => {
    expect(toPortalFileDTO({ id: "s", name: "s", mimeType: SHORTCUT_MIME_TYPE })).toBeNull();
    expect(toPortalFileDTO({ id: "m", name: "m", mimeType: "application/vnd.google-apps.map" })).toBeNull();
  });
});
