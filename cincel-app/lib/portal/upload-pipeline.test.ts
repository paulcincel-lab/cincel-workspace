// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { UploadChunkInput } from "@/lib/google/drive-admin";
import { receivePortalUpload, UPLOAD_CHUNK_BYTES, type PortalUploadDrive } from "@/lib/portal/upload-pipeline";
import { MAX_UPLOAD_BYTES, MULTIPART_OVERHEAD_BYTES } from "@/lib/portal/upload-validation";

const PDF_HEAD = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\n");
const EXE_HEAD = new TextEncoder().encode("MZ\u0090\u0000\u0003\u0000\u0000\u0000\u0004\u0000");
// 21:00 on Nov 3 in Mexico City.
const NOW = new Date("2026-11-04T03:00:00Z");

function pdfOfSize(size: number): Uint8Array {
  const file = new Uint8Array(size);
  file.set(PDF_HEAD);
  return file;
}

function fakeDrive(options: { failChunk?: boolean } = {}) {
  const chunks: { offset: number; length: number; total?: number }[] = [];
  const drive = {
    startResumableUpload: vi.fn(async () => "https://upload.example/session"),
    uploadChunk: vi.fn(async (_url: string, input: UploadChunkInput) => {
      if (options.failChunk) throw new Error("drive down");
      chunks.push({ offset: input.offset, length: input.chunk.byteLength, total: input.total });
      return input.total === undefined
        ? ({ done: false } as const)
        : ({ done: true, file: { id: "drive-1", name: "x", mimeType: "application/pdf" } } as const);
    }),
    cancelResumableUpload: vi.fn(async () => undefined),
  } satisfies PortalUploadDrive;
  return { drive, chunks };
}

function multipartRequest(name: string, content: Uint8Array, field = "file"): Request {
  const form = new FormData();
  form.append("note", "hola");
  form.append(field, new File([content as BlobPart], name));
  return new Request("http://localhost/api/portal/projects/p/uploads", { method: "POST", body: form });
}

/**
 * The same request with its body re-sent in 64 KB pieces, the way a network stream arrives. It also stops
 * cleanly when the pipeline aborts mid-body: undici's own FormData stream enqueues after cancel and rejects.
 */
async function inSmallChunks(request: Request): Promise<Request> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + 64 * 1024));
      offset += 64 * 1024;
    },
  });
  return new Request(request.url, { method: "POST", headers: request.headers, body, duplex: "half" } as RequestInit);
}

function upload(request: Request, drive: PortalUploadDrive) {
  return receivePortalUpload({ request, inboundFolderId: "inbound-1", clientName: "Ana López", now: NOW }, drive);
}

describe("receivePortalUpload", () => {
  it("streams a valid file into the inbound folder with the date and client prefix", async () => {
    const { drive, chunks } = fakeDrive();
    const file = pdfOfSize(20_000);

    const result = await upload(multipartRequest("Plano cocina.pdf", file), drive);

    expect(result).toEqual({
      ok: true,
      file: { id: "drive-1", name: "x", mimeType: "application/pdf" },
      originalName: "Plano cocina.pdf",
      driveName: "2026-11-03 · Ana López · Plano cocina.pdf",
      sizeBytes: 20_000,
    });
    expect(drive.startResumableUpload).toHaveBeenCalledWith({
      name: "2026-11-03 · Ana López · Plano cocina.pdf",
      parentId: "inbound-1",
      mimeType: "application/pdf",
    });
    expect(chunks).toEqual([{ offset: 0, length: 20_000, total: 20_000 }]);
    expect(drive.cancelResumableUpload).not.toHaveBeenCalled();
  });

  it("keeps UTF-8 file names", async () => {
    const { drive } = fakeDrive();
    const result = await upload(multipartRequest("Baño — señalética.pdf", pdfOfSize(100)), drive);
    expect(result).toMatchObject({ ok: true, originalName: "Baño — señalética.pdf" });
  });

  it("sends large files in 8 MiB chunks and the rest with the total", async () => {
    const { drive, chunks } = fakeDrive();
    const size = UPLOAD_CHUNK_BYTES * 2 + 1234;

    const result = await upload(multipartRequest("grande.pdf", pdfOfSize(size)), drive);

    expect(result).toMatchObject({ ok: true, sizeBytes: size });
    expect(chunks).toEqual([
      { offset: 0, length: UPLOAD_CHUNK_BYTES, total: undefined },
      { offset: UPLOAD_CHUNK_BYTES, length: UPLOAD_CHUNK_BYTES, total: undefined },
      { offset: UPLOAD_CHUNK_BYTES * 2, length: 1234, total: size },
    ]);
  });

  it("rejects a renamed .exe with unsupported_type before opening a Drive session", async () => {
    const { drive } = fakeDrive();
    const exe = new Uint8Array(4096);
    exe.set(EXE_HEAD);

    await expect(upload(await inSmallChunks(multipartRequest("factura.pdf", exe)), drive)).resolves.toEqual({
      ok: false,
      error: "unsupported_type",
    });
    await expect(upload(await inSmallChunks(multipartRequest("setup.exe", exe)), drive)).resolves.toEqual({
      ok: false,
      error: "unsupported_type",
    });
    expect(drive.startResumableUpload).not.toHaveBeenCalled();
  });

  it("aborts past 50 MB with too_large and cancels the Drive session", async () => {
    const { drive, chunks } = fakeDrive();

    const request = await inSmallChunks(multipartRequest("enorme.pdf", pdfOfSize(MAX_UPLOAD_BYTES + 10)));
    const result = await upload(request, drive);

    expect(result).toEqual({ ok: false, error: "too_large" });
    expect(drive.cancelResumableUpload).toHaveBeenCalledWith("https://upload.example/session");
    expect(chunks.every((chunk) => chunk.total === undefined)).toBe(true);
  });

  it("accepts a file of exactly 50 MB", async () => {
    const { drive } = fakeDrive();
    const result = await upload(multipartRequest("justo.pdf", pdfOfSize(MAX_UPLOAD_BYTES)), drive);
    expect(result).toMatchObject({ ok: true, sizeBytes: MAX_UPLOAD_BYTES });
  });

  it("answers too_large from Content-Length without reading the body", async () => {
    const { drive } = fakeDrive();
    const pull = vi.fn();
    const request = {
      headers: new Headers({
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(60 * 1024 * 1024),
      }),
      // highWaterMark 0: the stream only pulls when someone reads it.
      body: new ReadableStream({ pull }, { highWaterMark: 0 }),
    } as unknown as Request;

    await expect(upload(request, drive)).resolves.toEqual({ ok: false, error: "too_large" });
    expect(pull).not.toHaveBeenCalled();
    expect(drive.startResumableUpload).not.toHaveBeenCalled();
  });

  it("lets a body within the limit plus multipart overhead through the precheck", async () => {
    const { drive } = fakeDrive();
    const request = multipartRequest("plano.pdf", pdfOfSize(100));
    const headers = new Headers(request.headers);
    headers.set("content-length", String(MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES));
    const withLength = { headers, body: request.body } as unknown as Request;

    await expect(upload(withLength, drive)).resolves.toMatchObject({ ok: true });
  });

  it("answers invalid_request without a file part or a multipart body", async () => {
    const { drive } = fakeDrive();
    await expect(upload(multipartRequest("plano.pdf", pdfOfSize(100), "otro"), drive)).resolves.toEqual({
      ok: false,
      error: "invalid_request",
    });
    const json = new Request("http://localhost/x", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    await expect(upload(json, drive)).resolves.toEqual({ ok: false, error: "invalid_request" });
    expect(drive.startResumableUpload).not.toHaveBeenCalled();
  });

  it("cancels the session and answers upload_failed when Drive refuses a chunk", async () => {
    const { drive } = fakeDrive({ failChunk: true });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(upload(multipartRequest("plano.pdf", pdfOfSize(100)), drive)).resolves.toEqual({
      ok: false,
      error: "upload_failed",
    });
    expect(drive.cancelResumableUpload).toHaveBeenCalledWith("https://upload.example/session");
  });
});
