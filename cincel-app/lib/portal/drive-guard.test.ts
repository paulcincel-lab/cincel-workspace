// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DriveAdminError, type DriveFile } from "@/lib/google/drive-admin";
import {
  createDriveGuard,
  isPortalNotFound,
  MAX_ANCESTRY_DEPTH,
  PORTAL_PARENT_CACHE_TTL_MS,
  PortalNotFoundError,
} from "@/lib/portal/drive-guard";

/**
 * Fake Shared Drive:
 *   shared-root
 *   ├── proj-a            (project A folder)
 *   │   ├── a-interno     (01 Interno)  → a-secret.pdf
 *   │   ├── a-cliente     (02 Cliente)  → plano.pdf, sub/ → nested.pdf, viejo.pdf (trashed)
 *   │   └── a-inbound     (03 Del cliente)
 *   └── proj-b
 *       └── b-cliente     (02 Cliente)  → b-plano.pdf
 */
type Node = { name: string; parent?: string; trashed?: boolean };
let tree: Record<string, Node>;

function baseTree(): Record<string, Node> {
  return {
    "shared-root": { name: "Proyectos" },
    "proj-a": { name: "P-01 · Casa", parent: "shared-root" },
    "a-interno": { name: "01 Interno", parent: "proj-a" },
    "a-secret": { name: "costos.pdf", parent: "a-interno" },
    "a-cliente": { name: "02 Cliente", parent: "proj-a" },
    "a-inbound": { name: "03 Del cliente", parent: "proj-a" },
    plano: { name: "plano.pdf", parent: "a-cliente" },
    sub: { name: "Renders", parent: "a-cliente" },
    nested: { name: "nested.pdf", parent: "sub" },
    viejo: { name: "viejo.pdf", parent: "a-cliente", trashed: true },
    "proj-b": { name: "P-02 · Depa", parent: "shared-root" },
    "b-cliente": { name: "02 Cliente", parent: "proj-b" },
    "b-plano": { name: "b-plano.pdf", parent: "b-cliente" },
  };
}

const get = vi.fn<(fileId: string, fields?: string) => Promise<DriveFile>>();
let clock = 0;

function guard(options: { drive?: boolean } = {}) {
  return createDriveGuard({ getDrive: () => (options.drive === false ? null : { get }), now: () => clock });
}

const projectA = { driveClientFolderId: "a-cliente" };

beforeEach(() => {
  tree = baseTree();
  clock = 1_000_000;
  get.mockReset();
  get.mockImplementation(async (fileId) => {
    const node = tree[fileId];
    if (!node) throw new DriveAdminError("File not found", 404, "notFound");
    return {
      id: fileId,
      name: node.name,
      mimeType: "application/pdf",
      parents: node.parent ? [node.parent] : [],
      trashed: node.trashed ?? false,
    };
  });
});

describe("assertInsideClientFolder", () => {
  it("accepts the client folder itself without calling Drive", async () => {
    await expect(guard().assertInsideClientFolder("a-cliente", projectA)).resolves.toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it("accepts a direct child and asks Drive only for id, name, parents and trashed", async () => {
    const chain = await guard().assertInsideClientFolder("plano", projectA);
    expect(chain.map((m) => m.id)).toEqual(["plano"]);
    expect(get).toHaveBeenCalledWith("plano", "id,name,parents,trashed");
  });

  it("accepts a nested file and returns the chain for breadcrumbs", async () => {
    const chain = await guard().assertInsideClientFolder("nested", projectA);
    expect(chain.map((m) => m.name)).toEqual(["nested.pdf", "Renders"]);
  });

  it("accepts a file exactly 10 levels down and rejects one 11 levels down", async () => {
    let parent = "a-cliente";
    for (let level = 1; level <= MAX_ANCESTRY_DEPTH + 1; level++) {
      tree[`deep-${level}`] = { name: `nivel ${level}`, parent };
      parent = `deep-${level}`;
    }
    await expect(guard().assertInsideClientFolder(`deep-${MAX_ANCESTRY_DEPTH}`, projectA)).resolves.toHaveLength(
      MAX_ANCESTRY_DEPTH
    );
    await expect(guard().assertInsideClientFolder(`deep-${MAX_ANCESTRY_DEPTH + 1}`, projectA)).rejects.toBeInstanceOf(
      PortalNotFoundError
    );
  });

  it("rejects a trashed file", async () => {
    await expect(guard().assertInsideClientFolder("viejo", projectA)).rejects.toBeInstanceOf(PortalNotFoundError);
  });

  it("rejects a file under a trashed folder", async () => {
    tree.sub.trashed = true;
    await expect(guard().assertInsideClientFolder("nested", projectA)).rejects.toBeInstanceOf(PortalNotFoundError);
  });

  it("rejects a file and the client folder of another project", async () => {
    const g = guard();
    await expect(g.assertInsideClientFolder("b-plano", projectA)).rejects.toBeInstanceOf(PortalNotFoundError);
    await expect(g.assertInsideClientFolder("b-cliente", projectA)).rejects.toBeInstanceOf(PortalNotFoundError);
  });

  it("rejects 01 Interno, its files, 03 Del cliente and the project folder", async () => {
    const g = guard();
    for (const id of ["a-interno", "a-secret", "a-inbound", "proj-a", "shared-root"]) {
      await expect(g.assertInsideClientFolder(id, projectA)).rejects.toBeInstanceOf(PortalNotFoundError);
    }
  });

  it("maps a Drive 404 to a portal not-found", async () => {
    const error = await guard()
      .assertInsideClientFolder("does-not-exist", projectA)
      .catch((e: unknown) => e);
    expect(isPortalNotFound(error)).toBe(true);
    expect((error as PortalNotFoundError).status).toBe(404);
  });

  it("rejects when the project has no client folder or the id is empty", async () => {
    const g = guard();
    await expect(g.assertInsideClientFolder("plano", { driveClientFolderId: null })).rejects.toBeInstanceOf(
      PortalNotFoundError
    );
    await expect(g.assertInsideClientFolder("", projectA)).rejects.toBeInstanceOf(PortalNotFoundError);
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects when the service account isn't configured", async () => {
    await expect(guard({ drive: false }).assertInsideClientFolder("plano", projectA)).rejects.toBeInstanceOf(
      PortalNotFoundError
    );
  });

  it("lets Drive errors other than 404 through", async () => {
    get.mockRejectedValueOnce(new DriveAdminError("Backend error", 500, "backendError"));
    await expect(guard().assertInsideClientFolder("plano", projectA)).rejects.toBeInstanceOf(DriveAdminError);
  });
});

describe("parent cache", () => {
  it("serves parent lookups from the cache for 60 s", async () => {
    const g = guard();
    await g.assertInsideClientFolder("nested", projectA);
    await g.assertInsideClientFolder("nested", projectA);
    expect(get).toHaveBeenCalledTimes(2);

    clock += PORTAL_PARENT_CACHE_TTL_MS - 1;
    await g.assertInsideClientFolder("nested", projectA);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("refetches after 60 s, so a file moved out of 02 Cliente stops being reachable", async () => {
    const g = guard();
    await expect(g.assertInsideClientFolder("plano", projectA)).resolves.toHaveLength(1);

    tree.plano.parent = "a-interno";
    await expect(g.assertInsideClientFolder("plano", projectA)).resolves.toHaveLength(1);

    clock += PORTAL_PARENT_CACHE_TTL_MS;
    await expect(g.assertInsideClientFolder("plano", projectA)).rejects.toBeInstanceOf(PortalNotFoundError);
  });

  it("caches a Drive 404 but not a Drive outage", async () => {
    const g = guard();
    await expect(g.getParentCached("missing")).resolves.toBeNull();
    await expect(g.getParentCached("missing")).resolves.toBeNull();
    expect(get).toHaveBeenCalledTimes(1);

    get.mockRejectedValueOnce(new DriveAdminError("Backend error", 503, "backendError"));
    await expect(g.getParentCached("plano")).rejects.toBeInstanceOf(DriveAdminError);
    await expect(g.getParentCached("plano")).resolves.toMatchObject({ id: "plano", parents: ["a-cliente"] });
  });

  it("drops the oldest entries past the size limit", async () => {
    const g = createDriveGuard({ getDrive: () => ({ get }), now: () => clock, maxEntries: 2 });
    await g.getParentCached("plano");
    await g.getParentCached("sub");
    await g.getParentCached("nested");
    expect(get).toHaveBeenCalledTimes(3);
    await g.getParentCached("plano");
    expect(get).toHaveBeenCalledTimes(4);
  });

  it("clearCache forgets every entry", async () => {
    const g = guard();
    await g.getParentCached("plano");
    g.clearCache();
    await g.getParentCached("plano");
    expect(get).toHaveBeenCalledTimes(2);
  });
});
