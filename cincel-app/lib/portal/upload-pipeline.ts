import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

import busboy from "busboy";

import type { DriveAdmin, DriveFile } from "@/lib/google/drive-admin";
import { sanitizeFilename } from "@/lib/portal/file-delivery";
import {
  inboundFileName,
  MAX_UPLOAD_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  SNIFF_BYTES,
  sniffUpload,
} from "@/lib/portal/upload-validation";

/**
 * Streams one multipart file from the client into the project's
 * `03 Del cliente` folder (BE §B.4.7). Nothing is buffered beyond one Drive
 * chunk (8 MiB):
 *
 * 1. `Content-Length` above 50 MB plus multipart overhead → `too_large`
 *    before the body is read.
 * 2. `busboy` yields the `file` part; its first 4 KB are checked against the
 *    extension allowlist and the content rules → `unsupported_type`.
 * 3. A Drive resumable session is opened in the inbound folder (the folder id
 *    comes from the database, never from the request) and the stream is sent
 *    in chunks. Past 50 MB the session is cancelled → `too_large`, so no
 *    partial file is left in Drive.
 */

export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
/** The form field that carries the file. */
export const UPLOAD_FIELD = "file";

export type PortalUploadDrive = Pick<DriveAdmin, "startResumableUpload" | "uploadChunk" | "cancelResumableUpload">;

export type PortalUploadInput = {
  request: Request;
  inboundFolderId: string;
  /** The portal user's name, used in the Drive file name prefix. */
  clientName: string;
  now: Date;
};

export type PortalUploadSuccess = {
  ok: true;
  file: DriveFile;
  /** Sanitized original name, as the client sees it in Mis envíos. */
  originalName: string;
  /** Name given in Drive (`YYYY-MM-DD · cliente · nombre`). */
  driveName: string;
  sizeBytes: number;
};

export type PortalUploadFailure = {
  ok: false;
  error: "too_large" | "unsupported_type" | "invalid_request" | "upload_failed";
};

export type PortalUploadResult = PortalUploadSuccess | PortalUploadFailure;

const fail = (error: PortalUploadFailure["error"]): PortalUploadFailure => ({ ok: false, error });

class UploadTooLargeError extends Error {}
/** The request body failed mid-read (client gone, malformed multipart). */
class ClientStreamError extends Error {}

type FilePart = { fileName: string; stream: Readable };

/** Starts parsing the body and resolves with the first `file` part, or null when there is none. */
function firstFilePart(request: Request, contentType: string): { part: Promise<FilePart | null>; abort: () => void } {
  const source = Readable.fromWeb(request.body as unknown as NodeWebReadableStream<Uint8Array>);
  const parser = busboy({
    headers: { "content-type": contentType },
    defParamCharset: "utf8",
    // One byte past the limit, so the size check below sees the overflow.
    limits: { files: 1, fileSize: MAX_UPLOAD_BYTES + 1, fields: 10, parts: 12, fieldSize: 1024 },
  });

  const part = new Promise<FilePart | null>((resolve, reject) => {
    let found = false;
    parser.on("file", (field, stream, info) => {
      if (found || field !== UPLOAD_FIELD) {
        stream.resume();
        return;
      }
      found = true;
      resolve({ fileName: info.filename ?? "", stream });
    });
    parser.on("error", reject);
    parser.on("close", () => {
      if (!found) resolve(null);
    });
    source.on("error", reject);
  });
  source.pipe(parser);

  return {
    part,
    abort: () => {
      source.unpipe(parser);
      source.destroy();
      parser.removeAllListeners("file");
    },
  };
}

/** Collects chunks and hands them out in fixed-size pieces without copying on every push. */
class ChunkBuffer {
  private parts: Buffer[] = [];
  length = 0;

  push(chunk: Buffer) {
    this.parts.push(chunk);
    this.length += chunk.length;
  }

  take(size: number): Buffer {
    const all = this.parts.length === 1 ? this.parts[0] : Buffer.concat(this.parts, this.length);
    const piece = all.subarray(0, size);
    const rest = all.subarray(size);
    this.parts = rest.length ? [rest] : [];
    this.length = rest.length;
    return piece;
  }

  peek(size: number): Buffer {
    const all = Buffer.concat(this.parts, this.length);
    this.parts = all.length ? [all] : [];
    return all.subarray(0, size);
  }
}

export async function receivePortalUpload(
  input: PortalUploadInput,
  drive: PortalUploadDrive
): Promise<PortalUploadResult> {
  const { request } = input;

  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) return fail("too_large");

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\b/i.test(contentType) || !request.body) return fail("invalid_request");

  let parsing: ReturnType<typeof firstFilePart>;
  try {
    parsing = firstFilePart(request, contentType);
  } catch {
    return fail("invalid_request");
  }

  let part: FilePart | null;
  try {
    part = await parsing.part;
  } catch {
    parsing.abort();
    return fail("invalid_request");
  }
  if (!part || !part.fileName) {
    parsing.abort();
    return fail("invalid_request");
  }

  const originalName = sanitizeFilename(part.fileName);
  const chunks = part.stream[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  const buffer = new ChunkBuffer();
  let received = 0;
  let ended = false;

  async function pull(): Promise<boolean> {
    let next: IteratorResult<Buffer>;
    try {
      next = await chunks.next();
    } catch {
      throw new ClientStreamError();
    }
    if (next.done) {
      ended = true;
      return false;
    }
    received += next.value.length;
    if (received > MAX_UPLOAD_BYTES) throw new UploadTooLargeError();
    buffer.push(next.value);
    return true;
  }

  let sessionUrl: string | null = null;
  try {
    while (buffer.length < SNIFF_BYTES && (await pull()));

    const sniff = await sniffUpload(originalName, buffer.peek(SNIFF_BYTES));
    if (!sniff.ok) {
      parsing.abort();
      return fail("unsupported_type");
    }

    const driveName = inboundFileName(input.now, input.clientName, originalName);
    sessionUrl = await drive.startResumableUpload({
      name: driveName,
      parentId: input.inboundFolderId,
      mimeType: sniff.mimeType,
    });

    let offset = 0;
    for (;;) {
      // Strictly more than one chunk: the last PUT always carries at least one byte and the total.
      while (buffer.length > UPLOAD_CHUNK_BYTES) {
        const chunk = buffer.take(UPLOAD_CHUNK_BYTES);
        await drive.uploadChunk(sessionUrl, { chunk, offset });
        offset += chunk.length;
      }
      if (ended || !(await pull())) break;
    }

    const last = buffer.take(buffer.length);
    const result = await drive.uploadChunk(sessionUrl, { chunk: last, offset, total: offset + last.length });
    if (!result.done) throw new Error("Drive did not finish the upload");
    return { ok: true, file: result.file, originalName, driveName, sizeBytes: received };
  } catch (error) {
    parsing.abort();
    if (sessionUrl) await drive.cancelResumableUpload(sessionUrl);
    if (error instanceof UploadTooLargeError) return fail("too_large");
    if (error instanceof ClientStreamError) return fail("invalid_request");
    // Drive refused the session or a chunk.
    console.error("[portal] upload to Drive failed", error instanceof Error ? error.message : error);
    return fail("upload_failed");
  }
}
