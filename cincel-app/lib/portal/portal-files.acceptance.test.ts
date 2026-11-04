// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DriveAdminError,
  FOLDER_MIME_TYPE,
  type DriveFile,
  type MediaResponse,
  type UploadChunkInput,
} from "@/lib/google/drive-admin";
import {
  createDriveGuard,
  isPortalNotFound,
  PORTAL_PARENT_CACHE_TTL_MS,
  PortalNotFoundError,
} from "@/lib/portal/drive-guard";
import {
  deliverPortalFile,
  EXPORT_TOO_LARGE_MESSAGE,
  type PortalFileEventInput,
  type PortalFileKind,
} from "@/lib/portal/file-delivery";
import { createPortalFileLister, PORTAL_LIST_CACHE_TTL_MS } from "@/lib/portal/files";
import { receivePortalUpload } from "@/lib/portal/upload-pipeline";
import { MAX_UPLOAD_BYTES, sniffUpload } from "@/lib/portal/upload-validation";

/**
 * End-to-end coverage of the portal file paths (BE §10, §B.8 #3–7) on one
 * fake Shared Drive, with the real ancestry guard, lister, delivery and upload
 * pipeline wired together the way the routes wire them. Each describe block
 * names the acceptance criterion its failures disprove.
 *
 *   shared-root
 *   ├── proj-a              (project A)
 *   │   ├── a-interno       01 Interno     → costos.pdf, Privado/ → privado.pdf
 *   │   ├── a-cliente       02 Cliente     → plano.pdf, Memoria (Doc), Bitácora (Doc > 10 MB),
 *   │   │                                    Renders/ → render.jpg
 *   │   └── a-inbound       03 Del cliente
 *   └── proj-b              (project B)
 *       └── b-cliente       02 Cliente     → b-plano.pdf
 */
type Node = { name: string; parent: string | null; mimeType: string; size?: string; trashed?: boolean };
const DOC = "application/vnd.google-apps.document";
const PDF = "application/pdf";
let tree: Record<string, Node>;

function baseTree(): Record<string, Node> {
  return {
    "shared-root": { name: "Proyectos", parent: null, mimeType: FOLDER_MIME_TYPE },
    "proj-a": { name: "P-01 · Casa", parent: "shared-root", mimeType: FOLDER_MIME_TYPE },
    "a-interno": { name: "01 Interno", parent: "proj-a", mimeType: FOLDER_MIME_TYPE },
    costos: { name: "costos.pdf", parent: "a-interno", mimeType: PDF, size: "10" },
    privado: { name: "Privado", parent: "a-interno", mimeType: FOLDER_MIME_TYPE },
    "privado-pdf": { name: "privado.pdf", parent: "privado", mimeType: PDF, size: "10" },
    "a-cliente": { name: "02 Cliente", parent: "proj-a", mimeType: FOLDER_MIME_TYPE },
    plano: { name: "plano.pdf", parent: "a-cliente", mimeType: PDF, size: "1234" },
    memoria: { name: "Memoria", parent: "a-cliente", mimeType: DOC },
    bitacora: { name: "Bitácora", parent: "a-cliente", mimeType: DOC },
    renders: { name: "Renders", parent: "a-cliente", mimeType: FOLDER_MIME_TYPE },
    render: { name: "render.jpg", parent: "renders", mimeType: "image/jpeg", size: "77" },
    "a-inbound": { name: "03 Del cliente", parent: "proj-a", mimeType: FOLDER_MIME_TYPE },
    "proj-b": { name: "P-02 · Depa", parent: "shared-root", mimeType: FOLDER_MIME_TYPE },
    "b-cliente": { name: "02 Cliente", parent: "proj-b", mimeType: FOLDER_MIME_TYPE },
    "b-plano": { name: "b-plano.pdf", parent: "b-cliente", mimeType: PDF, size: "9" },
  };
}

const notFound = () => new DriveAdminError("File not found", 404, "notFound");

function toFile(id: string): DriveFile {
  const node = tree[id];
  if (!node) throw notFound();
  return {
    id,
    name: node.name,
    mimeType: node.mimeType,
    parents: node.parent ? [node.parent] : [],
    trashed: !!node.trashed,
    size: node.size,
    modifiedTime: "2026-11-01T10:00:00.000Z",
  };
}

function media(text: string, contentType: string): MediaResponse {
  return { body: new Response(text).body as ReadableStream<Uint8Array>, contentType, size: text.length };
}

let sessions: Map<string, { name: string; parentId: string; mimeType?: string; bytes: number }>;
let nextId = 0;

const drive = {
  get: vi.fn(async (id: string) => toFile(id)),
  listAll: vi.fn(async (options?: { parentId?: string }) =>
    Object.keys(tree)
      .filter((id) => tree[id].parent === options?.parentId && !tree[id].trashed)
      .map(toFile)
  ),
  getMedia: vi.fn(async (id: string) => media(`bytes:${id}`, toFile(id).mimeType)),
  export: vi.fn(async (id: string) => {
    if (id === "bitacora") {
      throw new DriveAdminError("This file is too large to be exported.", 403, "exportSizeLimitExceeded");
    }
    return media(`%PDF-1.7 ${id}`, PDF);
  }),
  startResumableUpload: vi.fn(async (input: { name: string; parentId?: string; mimeType?: string }) => {
    const url = `https://upload.example/session-${++nextId}`;
    sessions.set(url, { name: input.name, parentId: input.parentId ?? "", mimeType: input.mimeType, bytes: 0 });
    return url;
  }),
  uploadChunk: vi.fn(async (url: string, input: UploadChunkInput) => {
    const session = sessions.get(url);
    if (!session) throw new Error("unknown session");
    session.bytes += input.chunk.byteLength;
    if (input.total === undefined) return { done: false } as const;
    const id = `up-${nextId}`;
    const mimeType = session.mimeType ?? PDF;
    tree[id] = { name: session.name, parent: session.parentId, mimeType, size: String(session.bytes) };
    sessions.delete(url);
    return { done: true, file: toFile(id) } as const;
  }),
  cancelResumableUpload: vi.fn(async (url: string) => {
    sessions.delete(url);
  }),
};

let clock = 0;
const now = () => clock;
const guard = createDriveGuard({ getDrive: () => drive, now });
const lister = createPortalFileLister({ getDrive: () => drive, guard, now });
let events: PortalFileEventInput[];

const projectA = { projectId: "11111111-1111-1111-1111-111111111111", driveClientFolderId: "a-cliente" };

function deliver(fileId: string, kind: PortalFileKind = "download") {
  return deliverPortalFile(
    { kind, fileId, project: projectA, portalUserId: "user-1", ip: "203.0.113.7", userAgent: "Firefox" },
    {
      assertInsideClientFolder: (id, project) => guard.assertInsideClientFolder(id, project),
      drive,
      recordEvent: async (event) => {
        events.push(event);
      },
    }
  );
}

async function listIds(folderId?: string): Promise<string[]> {
  const folder = await lister.listFolder(projectA, folderId);
  return folder.items.map((item) => item.id);
}

// 21:00 on Nov 3 in Mexico City, already Nov 4 in UTC.
const NOW = new Date("2026-11-04T03:00:00Z");
const PDF_HEAD = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\n");
const EXE_HEAD = new TextEncoder().encode("MZ\u0090\u0000\u0003\u0000\u0000\u0000\u0004\u0000\u0000\u0000ÿÿ");

function headed(head: Uint8Array, size: number): Uint8Array {
  const file = new Uint8Array(size);
  file.set(head);
  return file;
}

function multipartRequest(name: string, content: Uint8Array): Request {
  const form = new FormData();
  form.append("file", new File([content as BlobPart], name));
  return new Request("http://localhost/api/portal/projects/p/uploads", { method: "POST", body: form });
}

/** A multipart body of `size` bytes generated lazily, without a Content-Length, like a chunked client. */
function streamedMultipartRequest(name: string, head: Uint8Array, size: number): Request {
  const boundary = "----portal-acceptance";
  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n` +
      "Content-Type: application/octet-stream\r\n\r\n"
  );
  const epilogue = encoder.encode(`\r\n--${boundary}--\r\n`);
  const piece = 1024 * 1024;
  let sent = 0;
  let stage: "preamble" | "body" | "epilogue" | "done" = "preamble";
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (stage === "preamble") {
        controller.enqueue(preamble);
        stage = "body";
      } else if (stage === "body") {
        const length = Math.min(piece, size - sent);
        const chunk = new Uint8Array(length);
        if (sent === 0) chunk.set(head.subarray(0, length));
        controller.enqueue(chunk);
        sent += length;
        if (sent >= size) stage = "epilogue";
      } else if (stage === "epilogue") {
        controller.enqueue(epilogue);
        stage = "done";
      } else {
        controller.close();
      }
    },
  });
  return new Request("http://localhost/api/portal/projects/p/uploads", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function upload(request: Request) {
  return receivePortalUpload({ request, inboundFolderId: "a-inbound", clientName: "Ana López", now: NOW }, drive);
}

beforeEach(() => {
  vi.clearAllMocks();
  tree = baseTree();
  sessions = new Map();
  nextId = 0;
  clock = 1_000_000;
  events = [];
  guard.clearCache();
  lister.clearCache();
});

describe("§B.8 #3: 02 Cliente files appear within 60 s; 01 Interno never does", () => {
  it("lists the client folder and its subfolders, never 01 Interno or 03 Del cliente", async () => {
    expect(await listIds()).toEqual(["renders", "bitacora", "memoria", "plano"]);
    expect(await listIds("renders")).toEqual(["render"]);
    for (const hidden of ["a-interno", "costos", "privado", "privado-pdf", "a-inbound"]) {
      expect(await listIds()).not.toContain(hidden);
    }
  });

  it("shows a file staff add to 02 Cliente once the 60 s cache expires", async () => {
    expect(await listIds()).not.toContain("nuevo");
    tree.nuevo = { name: "nuevo.pdf", parent: "a-cliente", mimeType: PDF, size: "1" };

    clock += PORTAL_LIST_CACHE_TTL_MS - 1;
    expect(await listIds()).not.toContain("nuevo");
    clock += 1;
    expect(await listIds()).toContain("nuevo");
    expect((await deliver("nuevo")).status).toBe(200);
  });

  it("never shows a file staff add to 01 Interno, however long the client waits", async () => {
    tree.nuevo = { name: "nuevo.pdf", parent: "a-interno", mimeType: PDF, size: "1" };
    clock += PORTAL_LIST_CACHE_TTL_MS * 10;
    expect(await listIds()).not.toContain("nuevo");
    expect((await deliver("nuevo")).status).toBe(404);
  });

  it("stops serving a file staff move from 02 Cliente to 01 Interno within 60 s", async () => {
    expect((await deliver("plano")).status).toBe(200);
    tree.plano.parent = "a-interno";

    clock += PORTAL_PARENT_CACHE_TTL_MS;
    expect((await deliver("plano")).status).toBe(404);
    clock += PORTAL_LIST_CACHE_TTL_MS;
    expect(await listIds()).not.toContain("plano");
  });
});

describe("§B.8 #4: 01 Interno and other-project ids answer 404 on list, download and preview", () => {
  const outside = [
    ["01 Interno", "a-interno"],
    ["a file in 01 Interno", "costos"],
    ["a nested 01 Interno folder", "privado"],
    ["a file nested in 01 Interno", "privado-pdf"],
    ["03 Del cliente", "a-inbound"],
    ["the project folder", "proj-a"],
    ["the Shared Drive root", "shared-root"],
    ["another project's 02 Cliente", "b-cliente"],
    ["a file in another project", "b-plano"],
    ["an unknown id", "no-existe"],
  ] as const;

  it.each(outside)("folder listing of %s → not found", async (_label, id) => {
    const error = await lister.listFolder(projectA, id).then(
      () => null,
      (e: unknown) => e
    );
    expect(isPortalNotFound(error)).toBe(true);
    expect(drive.listAll).not.toHaveBeenCalled();
  });

  it.each(outside)("download and preview of %s → 404 without reading content", async (_label, id) => {
    for (const kind of ["download", "preview"] as const) {
      const response = await deliver(id, kind);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
    expect(drive.getMedia).not.toHaveBeenCalled();
    expect(drive.export).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("treats trashed files and files under a trashed folder as not found", async () => {
    tree.plano.trashed = true;
    tree.renders.trashed = true;
    expect((await deliver("plano")).status).toBe(404);
    expect((await deliver("render")).status).toBe(404);
    await expect(lister.listFolder(projectA, "renders")).rejects.toBeInstanceOf(PortalNotFoundError);
  });

  it("gives up past 10 levels instead of walking up forever", async () => {
    let parent = "a-cliente";
    for (let level = 1; level <= 11; level++) {
      tree[`deep-${level}`] = { name: `Nivel ${level}`, parent, mimeType: FOLDER_MIME_TYPE };
      parent = `deep-${level}`;
    }
    await expect(lister.listFolder(projectA, "deep-10")).resolves.toMatchObject({ folderId: "deep-10" });
    await expect(lister.listFolder(projectA, "deep-11")).rejects.toBeInstanceOf(PortalNotFoundError);
  });

  it("answers 404 for an orphan whose parents are empty", async () => {
    tree.huerfano = { name: "huerfano.pdf", parent: null, mimeType: PDF, size: "1" };
    expect((await deliver("huerfano")).status).toBe(404);
  });
});

describe("§B.8 #5: Google Docs download as PDF; past the export limit the friendly message", () => {
  it("exports a Doc as a PDF attachment named .pdf and logs the download", async () => {
    const response = await deliver("memoria");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(PDF);
    expect(response.headers.get("Content-Disposition")).toBe(
      `attachment; filename="Memoria.pdf"; filename*=UTF-8''Memoria.pdf`
    );
    expect(await response.text()).toBe("%PDF-1.7 memoria");
    expect(drive.export).toHaveBeenCalledWith("memoria", PDF);
    expect(drive.getMedia).not.toHaveBeenCalled();
    expect(events).toMatchObject([{ driveFileId: "memoria", fileName: "Memoria.pdf", action: "download" }]);
  });

  it("answers 422 export_too_large with the Spanish message and logs nothing", async () => {
    const response = await deliver("bitacora");

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "export_too_large", message: EXPORT_TOO_LARGE_MESSAGE });
    expect(events).toEqual([]);
  });

  it("encodes non-ASCII names per RFC 6266 on every delivered file", async () => {
    tree.plano.name = 'Baño "final"/v2.pdf';
    const response = await deliver("plano", "preview");
    expect(response.headers.get("Content-Disposition")).toBe(
      `inline; filename="Bano _final__v2.pdf"; filename*=UTF-8''Ba%C3%B1o%20_final__v2.pdf`
    );
  });
});

describe("§B.8 #6: a client upload lands in 03 Del cliente with the date and name prefix", () => {
  it("creates the file in the inbound folder only, named YYYY-MM-DD · client · original", async () => {
    const result = await upload(multipartRequest("Plano cocina.pdf", headed(PDF_HEAD, 20_000)));

    const driveName = "2026-11-03 · Ana López · Plano cocina.pdf";
    expect(result).toMatchObject({ ok: true, driveName, sizeBytes: 20_000 });
    const created = Object.entries(tree).filter(([id]) => id.startsWith("up-"));
    expect(created).toEqual([
      [expect.any(String), expect.objectContaining({ parent: "a-inbound", name: driveName })],
    ]);
  });

  it("keeps the upload out of the client's own listing and downloads (03 Del cliente isn't listable)", async () => {
    const result = await upload(multipartRequest("Plano cocina.pdf", headed(PDF_HEAD, 2_000)));
    if (!result.ok) throw new Error("upload failed");

    clock += PORTAL_LIST_CACHE_TTL_MS;
    expect(await listIds()).not.toContain(result.file.id);
    expect((await deliver(result.file.id)).status).toBe(404);
  });

  it("sanitizes path separators in the original name, so the file can't escape the folder by name", async () => {
    const result = await upload(multipartRequest("../../01 Interno/plano.pdf", headed(PDF_HEAD, 2_000)));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.driveName).not.toContain("/");
    expect(drive.startResumableUpload).toHaveBeenCalledWith(expect.objectContaining({ parentId: "a-inbound" }));
  });
});

describe("§B.8 #7: a 60 MB upload and a renamed .exe are rejected", () => {
  it("rejects a 60 MB upload by Content-Length before reading the body", async () => {
    const pull = vi.fn();
    const request = {
      headers: new Headers({
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(60 * 1024 * 1024),
      }),
      body: new ReadableStream({ pull }),
    } as unknown as Request;

    await expect(upload(request)).resolves.toEqual({ ok: false, error: "too_large" });
    expect(pull).not.toHaveBeenCalled();
    expect(drive.startResumableUpload).not.toHaveBeenCalled();
  });

  it("aborts a streamed 60 MB upload without Content-Length and leaves nothing in Drive", async () => {
    const result = await upload(streamedMultipartRequest("enorme.pdf", PDF_HEAD, 60 * 1024 * 1024));

    expect(result).toEqual({ ok: false, error: "too_large" });
    expect(drive.cancelResumableUpload).toHaveBeenCalledTimes(1);
    expect(sessions.size).toBe(0);
    expect(Object.keys(tree).filter((id) => id.startsWith("up-"))).toEqual([]);
    const sent = drive.uploadChunk.mock.calls.reduce((n, [, input]) => n + input.chunk.byteLength, 0);
    expect(sent).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
  });

  it.each(["factura.pdf", "contrato.docx", "foto.jpg", "planta.dwg", "planta.dxf", "setup.exe"])(
    "rejects an executable uploaded as %s before opening a Drive session",
    async (name) => {
      await expect(upload(multipartRequest(name, headed(EXE_HEAD, 4096)))).resolves.toEqual({
        ok: false,
        error: "unsupported_type",
      });
      expect(drive.startResumableUpload).not.toHaveBeenCalled();
    }
  );

  it("applies the DWG and DXF rules: AC10 header for .dwg, 0/SECTION text for .dxf", async () => {
    const dwg = headed(new TextEncoder().encode("AC1032\u0000\u0000\u0000\u0000\u0000\u0000"), 512);
    const dxf = new TextEncoder().encode("  0\r\nSECTION\r\n  2\r\nHEADER\r\n");

    await expect(sniffUpload("planta.dwg", dwg)).resolves.toMatchObject({ ok: true });
    await expect(sniffUpload("planta.dxf", dxf)).resolves.toMatchObject({ ok: true });
    // Swapped extensions, a text file named .dwg and a binary DXF all fail.
    await expect(sniffUpload("planta.dxf", dwg)).resolves.toEqual({ ok: false });
    await expect(sniffUpload("planta.dwg", dxf)).resolves.toEqual({ ok: false });
    const binaryDxf = new TextEncoder().encode("AutoCAD Binary DXF\r\n\u001a\u0000");
    await expect(sniffUpload("planta.dxf", binaryDxf)).resolves.toEqual({ ok: false });
  });

  it("accepts a real PDF of exactly 50 MB", async () => {
    const result = await upload(streamedMultipartRequest("justo.pdf", PDF_HEAD, MAX_UPLOAD_BYTES));
    expect(result).toMatchObject({ ok: true, sizeBytes: MAX_UPLOAD_BYTES });
  });
});
