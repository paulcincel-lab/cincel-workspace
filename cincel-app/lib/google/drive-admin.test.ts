// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildListQuery,
  createDriveAdmin,
  DriveAdminError,
  FOLDER_MIME_TYPE,
  isDriveNotFound,
  isExportTooLarge,
} from "@/lib/google/drive-admin";

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function reply(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

function drive() {
  return createDriveAdmin({ getAccessToken: async () => "sa-token", fetch: fetchMock });
}

function call(n: number) {
  const [input, init] = fetchMock.mock.calls[n];
  const url = new URL(input);
  return { url, init: init ?? {}, headers: (init?.headers ?? {}) as Record<string, string> };
}

beforeEach(() => fetchMock.mockReset());

describe("drive-admin", () => {
  it("creates a folder in the given parent as the service account", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "f1", name: "P-01 · Casa", mimeType: FOLDER_MIME_TYPE, parents: ["root"] }));
    await expect(drive().createFolder("P-01 · Casa", "root")).resolves.toMatchObject({ id: "f1" });

    const { url, init, headers } = call(0);
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/drive/v3/files");
    expect(init.method).toBe("POST");
    expect(headers.Authorization).toBe("Bearer sa-token");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(url.searchParams.get("fields")).toContain("parents");
    expect(JSON.parse(init.body as string)).toEqual({ name: "P-01 · Casa", mimeType: FOLDER_MIME_TYPE, parents: ["root"] });
  });

  it("renames a file with a PATCH on its encoded id", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "a/b", name: "Nuevo" }));
    await drive().rename("a/b", "Nuevo");

    const { url, init } = call(0);
    expect(url.pathname).toBe("/drive/v3/files/a%2Fb");
    expect(init.method).toBe("PATCH");
    expect(url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Nuevo" });
  });

  it("gets id, name, parents and trashed, and the parents alone", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { id: "x", name: "n", parents: ["p"], trashed: false }))
      .mockResolvedValueOnce(reply(200, { id: "x", parents: ["p1"] }))
      .mockResolvedValueOnce(reply(200, { id: "drive-root" }));
    const admin = drive();

    await expect(admin.get("x")).resolves.toEqual({ id: "x", name: "n", parents: ["p"], trashed: false });
    expect(call(0).url.searchParams.get("fields")).toEqual(expect.stringContaining("id,name,mimeType,parents,trashed"));
    expect(call(0).url.searchParams.get("supportsAllDrives")).toBe("true");

    await expect(admin.getParents("x")).resolves.toEqual(["p1"]);
    expect(call(1).url.searchParams.get("fields")).toBe("id,parents");
    expect(call(1).url.searchParams.get("supportsAllDrives")).toBe("true");

    await expect(admin.getParents("drive-root")).resolves.toEqual([]);
  });

  it("lists a folder's children with all-drives flags and no trashed files", async () => {
    fetchMock.mockResolvedValue(reply(200, { files: [{ id: "c1", name: "a" }], nextPageToken: "t2" }));
    await expect(drive().list({ parentId: "fold'er", pageSize: 50, driveId: "sd" })).resolves.toEqual({
      files: [{ id: "c1", name: "a" }],
      nextPageToken: "t2",
    });

    const { url } = call(0);
    expect(url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(url.searchParams.get("includeItemsFromAllDrives")).toBe("true");
    expect(url.searchParams.get("q")).toBe("'fold\\'er' in parents and trashed = false");
    expect(url.searchParams.get("corpora")).toBe("drive");
    expect(url.searchParams.get("driveId")).toBe("sd");
    expect(url.searchParams.get("pageSize")).toBe("50");
    expect(url.searchParams.get("fields")).toMatch(/^nextPageToken,files\(/);
  });

  it("listAll follows page tokens", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { files: [{ id: "1" }], nextPageToken: "n" }))
      .mockResolvedValueOnce(reply(200, { files: [{ id: "2" }] }));
    await expect(drive().listAll({ parentId: "p" })).resolves.toEqual([{ id: "1" }, { id: "2" }]);
    expect(call(0).url.searchParams.get("pageToken")).toBeNull();
    expect(call(1).url.searchParams.get("pageToken")).toBe("n");
    expect(call(1).url.searchParams.get("includeItemsFromAllDrives")).toBe("true");
  });

  it("builds list queries", () => {
    expect(buildListQuery({})).toBe("trashed = false");
    expect(buildListQuery({ includeTrashed: true })).toBeUndefined();
    expect(buildListQuery({ parentId: "p", q: `name = 'x'` })).toBe("'p' in parents and trashed = false and (name = 'x')");
  });

  it("streams media and exports", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("bytes", { status: 200, headers: { "content-type": "image/png", "content-length": "5" } }))
      .mockResolvedValueOnce(new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } }));
    const admin = drive();

    const media = await admin.getMedia("img");
    expect(media.contentType).toBe("image/png");
    expect(media.size).toBe(5);
    expect(await new Response(media.body).text()).toBe("bytes");
    expect(call(0).url.searchParams.get("alt")).toBe("media");
    expect(call(0).url.searchParams.get("supportsAllDrives")).toBe("true");

    const pdf = await admin.export("doc", "application/pdf");
    expect(pdf.contentType).toBe("application/pdf");
    expect(call(1).url.pathname).toBe("/drive/v3/files/doc/export");
    expect(call(1).url.searchParams.get("mimeType")).toBe("application/pdf");
    expect(call(1).url.searchParams.get("supportsAllDrives")).toBe("true");
  });

  it("uploads through a resumable session", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, undefined, { location: "https://upload.example/session-1" }))
      .mockResolvedValueOnce(reply(200, { id: "up1", name: "plano.pdf" }));
    const body = new TextEncoder().encode("hello");

    await expect(
      drive().uploadResumable({ name: "plano.pdf", parentId: "dest", mimeType: "application/pdf", body })
    ).resolves.toEqual({ id: "up1", name: "plano.pdf" });

    const start = call(0);
    expect(start.url.origin + start.url.pathname).toBe("https://www.googleapis.com/upload/drive/v3/files");
    expect(start.url.searchParams.get("uploadType")).toBe("resumable");
    expect(start.url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(start.headers["X-Upload-Content-Type"]).toBe("application/pdf");
    expect(start.headers["X-Upload-Content-Length"]).toBe("5");
    expect(JSON.parse(start.init.body as string)).toEqual({ name: "plano.pdf", parents: ["dest"], mimeType: "application/pdf" });

    const put = call(1);
    expect(put.url.href).toBe("https://upload.example/session-1");
    expect(put.init.method).toBe("PUT");
    expect(put.headers["Content-Length"]).toBe("5");
    expect(put.headers.Authorization).toBe("Bearer sa-token");
  });

  it("streams an upload body half-duplex and needs its size", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, undefined, { location: "https://upload.example/s" }))
      .mockResolvedValueOnce(reply(200, { id: "up2" }));
    const stream = () => new Response("abc").body!;

    await expect(
      drive().uploadResumable({ name: "a", parentId: "p", mimeType: "text/plain", body: stream() })
    ).rejects.toThrow(/size/);
    expect(fetchMock).not.toHaveBeenCalled();

    await drive().uploadResumable({ name: "a", parentId: "p", mimeType: "text/plain", body: stream(), size: 3 });
    expect((call(1).init as RequestInit & { duplex?: string }).duplex).toBe("half");
  });

  it("trashes instead of deleting", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "t", trashed: true }));
    await expect(drive().trash("t")).resolves.toMatchObject({ trashed: true });
    const { url, init } = call(0);
    expect(init.method).toBe("PATCH");
    expect(url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(JSON.parse(init.body as string)).toEqual({ trashed: true });
  });

  it("surfaces Drive's message, status and reason", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(404, { error: { message: "File not found: x.", errors: [{ reason: "notFound" }] } }))
      .mockResolvedValueOnce(
        reply(403, { error: { message: "too large", errors: [{ reason: "exportSizeLimitExceeded" }] } })
      )
      .mockResolvedValueOnce(new Response("oops", { status: 500 }));
    const admin = drive();

    const notFound = await admin.get("x").catch((e) => e);
    expect(notFound).toBeInstanceOf(DriveAdminError);
    expect(notFound.message).toBe("File not found: x.");
    expect(isDriveNotFound(notFound)).toBe(true);

    const tooLarge = await admin.export("d", "application/pdf").catch((e) => e);
    expect(isExportTooLarge(tooLarge)).toBe(true);

    const server = await admin.trash("y").catch((e) => e);
    expect(server.status).toBe(500);
    expect(server.reason).toBeNull();
  });

  it("requires credentials or a token source", () => {
    expect(() => createDriveAdmin({})).toThrow(/credentials/);
  });

  it("has no server-only import, so the CLI can load it", () => {
    const src = readFileSync(resolve(__dirname, "drive-admin.ts"), "utf8");
    expect(src).not.toMatch(/["']server-only["']/);
    expect(src).not.toMatch(/lib\/db\/client/);
  });
});
