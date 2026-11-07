/**
 * Profile photo metadata stripping (redesign BE §8.11), without new
 * dependencies. Only the containers are rewritten; the image data is copied
 * byte for byte.
 *
 * - JPEG: drop the APP1 (EXIF, XMP) and APP13 (Photoshop / IPTC) segments.
 * - PNG: drop the `eXIf`, `tEXt`, `iTXt` and `zTXt` chunks.
 * - WebP: drop the `EXIF` and `XMP ` chunks and clear their VP8X flags.
 *
 * A file whose structure can't be walked throws `MalformedImageError`; the
 * upload route answers it as `415 INVALID_TYPE`.
 */

export type PhotoMime = "image/jpeg" | "image/png" | "image/webp";

export const PHOTO_MIMES: readonly PhotoMime[] = ["image/jpeg", "image/png", "image/webp"];

export class MalformedImageError extends Error {
  constructor(detail: string) {
    super(`INVALID_TYPE: ${detail}`);
    this.name = "MalformedImageError";
  }
}

export function isPhotoMime(mime: string | undefined | null): mime is PhotoMime {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}

/** Strip the metadata of a jpeg / png / webp file. Returns a new buffer. */
export function stripImageMetadata(bytes: Uint8Array, mime: PhotoMime): Buffer {
  switch (mime) {
    case "image/jpeg":
      return stripJpegMetadata(bytes);
    case "image/png":
      return stripPngMetadata(bytes);
    case "image/webp":
      return stripWebpMetadata(bytes);
  }
}

// ── JPEG ────────────────────────────────────────────────────────────────────

const JPEG_APP1 = 0xe1;
const JPEG_APP13 = 0xed;
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;

/** Markers without a length field: TEM and RST0–RST7. */
function isStandaloneJpegMarker(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

export function stripJpegMetadata(input: Uint8Array): Buffer {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new MalformedImageError("jpeg: missing SOI");
  }

  const parts: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new MalformedImageError("jpeg: expected a marker");
    // Fill bytes: any number of 0xFF may precede a marker.
    let markerAt = offset;
    while (markerAt + 1 < bytes.length && bytes[markerAt + 1] === 0xff) markerAt++;
    if (markerAt + 1 >= bytes.length) throw new MalformedImageError("jpeg: truncated marker");
    const marker = bytes[markerAt + 1];
    const segmentStart = markerAt;

    if (marker === JPEG_EOI) {
      parts.push(bytes.subarray(segmentStart, markerAt + 2));
      offset = markerAt + 2;
      break;
    }
    if (isStandaloneJpegMarker(marker)) {
      parts.push(bytes.subarray(segmentStart, markerAt + 2));
      offset = markerAt + 2;
      continue;
    }

    if (markerAt + 4 > bytes.length) throw new MalformedImageError("jpeg: truncated segment length");
    const length = bytes.readUInt16BE(markerAt + 2);
    if (length < 2) throw new MalformedImageError("jpeg: bad segment length");
    const segmentEnd = markerAt + 2 + length;
    if (segmentEnd > bytes.length) throw new MalformedImageError("jpeg: truncated segment");

    if (marker === JPEG_SOS) {
      // Start of scan: the entropy-coded data and everything after it is image data.
      parts.push(bytes.subarray(segmentStart));
      offset = bytes.length;
      break;
    }

    if (marker !== JPEG_APP1 && marker !== JPEG_APP13) {
      parts.push(bytes.subarray(segmentStart, segmentEnd));
    }
    offset = segmentEnd;
  }

  return Buffer.concat(parts);
}

// ── PNG ─────────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROPPED_CHUNKS = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);

export function stripPngMetadata(input: Uint8Array): Buffer {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new MalformedImageError("png: missing signature");
  }

  const parts: Buffer[] = [bytes.subarray(0, 8)];
  let offset = 8;
  let sawEnd = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new MalformedImageError("png: truncated chunk header");
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) throw new MalformedImageError("png: truncated chunk");

    if (!PNG_DROPPED_CHUNKS.has(type)) parts.push(bytes.subarray(offset, chunkEnd));
    offset = chunkEnd;

    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }

  if (!sawEnd) throw new MalformedImageError("png: missing IEND");
  return Buffer.concat(parts);
}

// ── WebP ────────────────────────────────────────────────────────────────────

const WEBP_DROPPED_CHUNKS = new Set(["EXIF", "XMP "]);
/** VP8X flag bits (first payload byte): `E` (EXIF) and `X` (XMP). */
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

export function stripWebpMetadata(input: Uint8Array): Buffer {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (
    bytes.length < 12 ||
    bytes.toString("latin1", 0, 4) !== "RIFF" ||
    bytes.toString("latin1", 8, 12) !== "WEBP"
  ) {
    throw new MalformedImageError("webp: missing RIFF/WEBP header");
  }

  const riffEnd = Math.min(bytes.length, 8 + bytes.readUInt32LE(4));
  const chunks: Buffer[] = [];
  let offset = 12;

  while (offset < riffEnd) {
    if (offset + 8 > riffEnd) throw new MalformedImageError("webp: truncated chunk header");
    const fourcc = bytes.toString("latin1", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const padded = size + (size % 2);
    const dataEnd = offset + 8 + size;
    if (dataEnd > riffEnd) throw new MalformedImageError("webp: truncated chunk");
    const chunkEnd = Math.min(offset + 8 + padded, riffEnd);

    if (!WEBP_DROPPED_CHUNKS.has(fourcc)) {
      const chunk = Buffer.from(bytes.subarray(offset, chunkEnd));
      if (fourcc === "VP8X" && size >= 1) {
        chunk[8] &= ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG) & 0xff;
      }
      // Keep chunks even-sized so the RIFF stays valid.
      chunks.push(chunk.length % 2 === 0 ? chunk : Buffer.concat([chunk, Buffer.alloc(1)]));
    }
    offset = chunkEnd;
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}
