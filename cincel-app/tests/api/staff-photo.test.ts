// @vitest-environment node
/**
 * Profile photo routes and remove action (redesign BE §7.2, §8.11, §16):
 * GPS-EXIF fixtures for jpeg, png and webp are stripped; POST answers
 * 401 / 413 / 415 / 429; GET sends a sha256 ETag, 304 on match, 404 when
 * absent, private cache.
 */
import { unwrapActions } from "@/tests/helpers/action-result";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

import { fileTypeFromBuffer } from "file-type";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const STAFF_ID = "11111111-2222-4333-8444-555555555555";

const session = vi.hoisted(() => ({
  value: { status: "active", user: { id: "11111111-2222-4333-8444-555555555555" } } as {
    status: string;
    user: { id: string } | null;
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionAccess: vi.fn(async () => session.value),
  requireCapabilityUser: vi.fn(async () => {
    if (!session.value.user) throw new Error("FORBIDDEN");
    return { member: { id: session.value.user.id }, access: "Colaborador" };
  }),
}));

vi.mock("@/lib/db/client", () => ({ db: { __db: true } }));

const repo = vi.hoisted(() => ({
  findStaffPhoto: vi.fn(),
  upsertStaffPhoto: vi.fn(),
  deleteStaffPhoto: vi.fn(),
}));
vi.mock("@/lib/repositories/preferences-repository", () => repo);

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import * as profilePhotoActionsModule from "@/lib/actions/profile-photo-actions";
import { IMPLEMENTED } from "@/lib/actions/profile-photo-actions.flags";
import { photoUploadRateLimiter } from "@/lib/profile-photo/upload";
import { stripImageMetadata } from "@/lib/profile-photo/strip-metadata";
import { GET } from "@/app/api/staff/[id]/photo/route";
import { POST } from "@/app/api/staff/me/photo/route";

const { removeMyPhotoAction } = unwrapActions(profilePhotoActionsModule);

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A big-endian TIFF block whose IFD0 points at a GPS IFD (lat 19°25'57" N, lon 99°7'59" W). */
function gpsTiff(): Buffer {
  const entries = (count: number) => 2 + count * 12 + 4;
  const ifd0At = 8;
  const gpsAt = ifd0At + entries(1);
  const gpsEntries = 4;
  const dataAt = gpsAt + entries(gpsEntries);
  const buf = Buffer.alloc(dataAt + 48);
  buf.write("MM", 0, "latin1");
  buf.writeUInt16BE(42, 2);
  buf.writeUInt32BE(ifd0At, 4);

  buf.writeUInt16BE(1, ifd0At);
  buf.writeUInt16BE(0x8825, ifd0At + 2); // GPSInfo
  buf.writeUInt16BE(4, ifd0At + 4); // LONG
  buf.writeUInt32BE(1, ifd0At + 6);
  buf.writeUInt32BE(gpsAt, ifd0At + 10);
  buf.writeUInt32BE(0, ifd0At + 14);

  buf.writeUInt16BE(gpsEntries, gpsAt);
  const entry = (i: number, tag: number, type: number, count: number, value: (at: number) => void) => {
    const at = gpsAt + 2 + i * 12;
    buf.writeUInt16BE(tag, at);
    buf.writeUInt16BE(type, at + 2);
    buf.writeUInt32BE(count, at + 4);
    value(at + 8);
  };
  entry(0, 0x0001, 2, 2, (at) => buf.write("N\0", at, "latin1")); // GPSLatitudeRef
  entry(1, 0x0002, 5, 3, (at) => buf.writeUInt32BE(dataAt, at)); // GPSLatitude
  entry(2, 0x0003, 2, 2, (at) => buf.write("W\0", at, "latin1")); // GPSLongitudeRef
  entry(3, 0x0004, 5, 3, (at) => buf.writeUInt32BE(dataAt + 24, at)); // GPSLongitude
  buf.writeUInt32BE(0, gpsAt + 2 + gpsEntries * 12);

  [19, 1, 25, 1, 57, 1, 99, 1, 7, 1, 59, 1].forEach((n, i) => buf.writeUInt32BE(n, dataAt + i * 4));
  return buf;
}

const TIFF = gpsTiff();
const EXIF_PAYLOAD = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), TIFF]);
const XMP_PACKET = Buffer.from(
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description exif:GPSLatitude="19,25.95N" exif:GPSLongitude="99,7.98W"/></rdf:RDF></x:xmpmeta>',
  "latin1"
);
const XMP_NS = Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1");

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

function jpegFixture(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, Buffer.from([0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00])),
    jpegSegment(0xe1, EXIF_PAYLOAD),
    jpegSegment(0xe1, Buffer.concat([XMP_NS, XMP_PACKET])),
    jpegSegment(0xed, Buffer.concat([Buffer.from("Photoshop 3.0\0", "latin1"), Buffer.from("8BIM GPS", "latin1")])),
    jpegSegment(0xdb, Buffer.concat([Buffer.from([0x00]), Buffer.alloc(64, 1)])),
    jpegSegment(0xc0, Buffer.from([0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00])),
    jpegSegment(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
    Buffer.from([0x12, 0x34, 0x56]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function pngFixture(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("eXIf", TIFF),
    pngChunk("tEXt", Buffer.from("Comment\0GPS 19.4326 N 99.1332 W", "latin1")),
    pngChunk("iTXt", Buffer.concat([Buffer.from("XML:com.adobe.xmp\0\0\0\0\0", "latin1"), XMP_PACKET])),
    pngChunk("zTXt", Buffer.concat([Buffer.from("Location\0\0", "latin1"), deflateSync(Buffer.from("GPS"))])),
    pngChunk("IDAT", deflateSync(Buffer.from([0x00, 0xff, 0x00, 0x00]))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function riffChunk(fourcc: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(fourcc, 0, "latin1");
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

const VP8X_FLAGS = 0x08 | 0x04 | 0x10; // EXIF, XMP, alpha

function webpFixture(): Buffer {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = VP8X_FLAGS;
  const body = Buffer.concat([
    riffChunk("VP8X", vp8x),
    riffChunk("VP8L", Buffer.from([0x2f, 0x00, 0x00, 0x00, 0x00])),
    riffChunk("EXIF", TIFF),
    riffChunk("XMP ", XMP_PACKET.length % 2 ? XMP_PACKET : Buffer.concat([XMP_PACKET, Buffer.from(" ")])),
  ]);
  const head = Buffer.alloc(12);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(4 + body.length, 4);
  head.write("WEBP", 8, "latin1");
  return Buffer.concat([head, body]);
}

const FIXTURES = [
  { mime: "image/jpeg" as const, make: jpegFixture },
  { mime: "image/png" as const, make: pngFixture },
  { mime: "image/webp" as const, make: webpFixture },
];

function expectNoMetadata(bytes: Buffer): void {
  expect(bytes.indexOf(TIFF)).toBe(-1);
  expect(bytes.indexOf(Buffer.from("Exif\0\0", "latin1"))).toBe(-1);
  expect(bytes.indexOf(Buffer.from("MM\0*", "latin1"))).toBe(-1);
  expect(bytes.indexOf(Buffer.from("GPS", "latin1"))).toBe(-1);
  expect(bytes.indexOf(Buffer.from("xmpmeta", "latin1"))).toBe(-1);
  expect(bytes.indexOf(Buffer.from("ns.adobe.com", "latin1"))).toBe(-1);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function uploadRequest(bytes: Buffer | null, name = "foto.jpg", type = "image/jpeg"): NextRequest {
  const form = new FormData();
  if (bytes) form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  return new NextRequest("http://localhost/api/staff/me/photo", { method: "POST", body: form });
}

function readRequest(id: string, headers: Record<string, string> = {}) {
  return [
    new NextRequest(`http://localhost/api/staff/${id}/photo`, { headers }),
    { params: Promise.resolve({ id }) },
  ] as const;
}

beforeEach(() => {
  session.value = { status: "active", user: { id: STAFF_ID } };
  photoUploadRateLimiter.reset();
  repo.findStaffPhoto.mockReset();
  repo.upsertStaffPhoto.mockReset();
  repo.deleteStaffPhoto.mockReset();
  repo.upsertStaffPhoto.mockImplementation(async (_db, staffId, photo) => ({ staffId, ...photo }));
  revalidatePath.mockReset();
});

// ── Metadata stripping ──────────────────────────────────────────────────────

describe("stripImageMetadata", () => {
  it.each(FIXTURES)("drops GPS EXIF and XMP from $mime", async ({ mime, make }) => {
    const input = make();
    expect(input.indexOf(TIFF)).toBeGreaterThan(-1);

    const output = stripImageMetadata(input, mime);
    expectNoMetadata(output);
    expect(output.length).toBeLessThan(input.length);
    expect((await fileTypeFromBuffer(output))?.mime).toBe(mime);
  });

  it("keeps the jpeg image segments and scan data", () => {
    const output = stripImageMetadata(jpegFixture(), "image/jpeg");
    expect([...output.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect(output.indexOf(Buffer.from("JFIF", "latin1"))).toBeGreaterThan(-1);
    expect(output.indexOf(Buffer.from([0xff, 0xc0]))).toBeGreaterThan(-1);
    expect(output.indexOf(Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]))).toBe(output.length - 5);
  });

  it("keeps the png image chunks", () => {
    const output = stripImageMetadata(pngFixture(), "image/png");
    for (const type of ["IHDR", "IDAT", "IEND"]) {
      expect(output.indexOf(Buffer.from(type, "latin1"))).toBeGreaterThan(-1);
    }
    for (const type of ["eXIf", "tEXt", "iTXt", "zTXt"]) {
      expect(output.indexOf(Buffer.from(type, "latin1"))).toBe(-1);
    }
  });

  it("clears the webp VP8X metadata flags and rewrites the RIFF size", () => {
    const output = stripImageMetadata(webpFixture(), "image/webp");
    expect(output.readUInt32LE(4)).toBe(output.length - 8);
    const vp8xAt = output.indexOf(Buffer.from("VP8X", "latin1"));
    expect(output[vp8xAt + 8]).toBe(0x10);
    expect(output.indexOf(Buffer.from("VP8L", "latin1"))).toBeGreaterThan(-1);
    expect(output.indexOf(Buffer.from("XMP ", "latin1"))).toBe(-1);
  });

  it("throws on a truncated file", () => {
    expect(() => stripImageMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x40, 0x4a]), "image/jpeg")).toThrow(
      /INVALID_TYPE/
    );
    expect(() => stripImageMetadata(pngFixture().subarray(0, 40), "image/png")).toThrow(/INVALID_TYPE/);
  });
});

// ── POST /api/staff/me/photo ────────────────────────────────────────────────

describe("POST /api/staff/me/photo", () => {
  it.each(FIXTURES)("stores a stripped $mime and returns its url", async ({ mime, make }) => {
    const res = await POST(uploadRequest(make(), "foto", mime));
    expect(res.status).toBe(200);

    expect(repo.upsertStaffPhoto).toHaveBeenCalledTimes(1);
    const [, staffId, stored] = repo.upsertStaffPhoto.mock.calls[0];
    expect(staffId).toBe(STAFF_ID);
    expect(stored.mime).toBe(mime);
    expectNoMetadata(stored.bytes);
    expect(stored.sha256).toBe(createHash("sha256").update(stored.bytes).digest("hex"));

    await expect(res.json()).resolves.toEqual({
      url: `/api/staff/${STAFF_ID}/photo?v=${stored.sha256.slice(0, 8)}`,
    });
    // S2: the client updates `qk.me.profile()`; the route never re-renders the layout.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("trusts magic bytes, not the declared type", async () => {
    const res = await POST(uploadRequest(pngFixture(), "foto.jpg", "image/jpeg"));
    expect(res.status).toBe(200);
    expect(repo.upsertStaffPhoto.mock.calls[0][2].mime).toBe("image/png");
  });

  it("401 without a session", async () => {
    session.value = { status: "guest", user: null };
    const res = await POST(uploadRequest(jpegFixture()));
    expect(res.status).toBe(401);
    expect(repo.upsertStaffPhoto).not.toHaveBeenCalled();
  });

  it("403 without system access", async () => {
    session.value = { status: "no_system_access", user: null };
    const res = await POST(uploadRequest(jpegFixture()));
    expect(res.status).toBe(403);
  });

  it("413 TOO_LARGE over 2 MB", async () => {
    const big = Buffer.concat([jpegFixture(), Buffer.alloc(2 * 1024 * 1024)]);
    const res = await POST(uploadRequest(big));
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({ error: "TOO_LARGE" });
    expect(repo.upsertStaffPhoto).not.toHaveBeenCalled();
  });

  it("413 TOO_LARGE when the stripped photo is over the 1 MB stored limit", async () => {
    const jpeg = jpegFixture();
    const padded = Buffer.concat([jpeg.subarray(0, jpeg.length - 2), Buffer.alloc(1024 * 1024 + 1, 0x11), jpeg.subarray(-2)]);
    const res = await POST(uploadRequest(padded));
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({ error: "TOO_LARGE" });
  });

  it("415 INVALID_TYPE for a gif, a text file or a broken jpeg", async () => {
    const gif = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(32)]);
    const text = Buffer.from("no soy una imagen", "utf8");
    const broken = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x40, 0x4a, 0x46, 0x49, 0x46]);
    for (const bytes of [gif, text, broken]) {
      const res = await POST(uploadRequest(bytes, "foto.jpg", "image/jpeg"));
      expect(res.status).toBe(415);
      await expect(res.json()).resolves.toEqual({ error: "INVALID_TYPE" });
    }
    expect(repo.upsertStaffPhoto).not.toHaveBeenCalled();
  });

  it("400 INVALID without a file field", async () => {
    const res = await POST(uploadRequest(null));
    expect(res.status).toBe(400);
  });

  it("429 RATE_LIMITED after 10 uploads in an hour", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await POST(uploadRequest(jpegFixture()))).status).toBe(200);
    }
    const res = await POST(uploadRequest(jpegFixture()));
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: "RATE_LIMITED" });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(repo.upsertStaffPhoto).toHaveBeenCalledTimes(10);
  });

  it("rate-limits per staff", async () => {
    for (let i = 0; i < 10; i++) await POST(uploadRequest(jpegFixture()));
    session.value = { status: "active", user: { id: "99999999-2222-4333-8444-555555555555" } };
    expect((await POST(uploadRequest(jpegFixture()))).status).toBe(200);
  });
});

// ── GET /api/staff/[id]/photo ───────────────────────────────────────────────

describe("GET /api/staff/[id]/photo", () => {
  const bytes = stripImageMetadata(jpegFixture(), "image/jpeg");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  it("401 without a session", async () => {
    session.value = { status: "guest", user: null };
    const res = await GET(...readRequest(STAFF_ID));
    expect(res.status).toBe(401);
    expect(repo.findStaffPhoto).not.toHaveBeenCalled();
  });

  it("404 when the staff has no photo", async () => {
    repo.findStaffPhoto.mockResolvedValue(null);
    const res = await GET(...readRequest(STAFF_ID));
    expect(res.status).toBe(404);
    expect(repo.findStaffPhoto).toHaveBeenCalledWith(expect.anything(), STAFF_ID);
  });

  it("404 for an id that is not a uuid, without a query", async () => {
    const res = await GET(...readRequest("no-es-uuid"));
    expect(res.status).toBe(404);
    expect(repo.findStaffPhoto).not.toHaveBeenCalled();
  });

  it("sends the bytes with a sha256 ETag and a private cache", async () => {
    repo.findStaffPhoto.mockResolvedValue({ staffId: STAFF_ID, mime: "image/jpeg", bytes, sha256 });
    const res = await GET(...readRequest(STAFF_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe(`"${sha256}"`);
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
  });

  it("304 when If-None-Match matches", async () => {
    repo.findStaffPhoto.mockResolvedValue({ staffId: STAFF_ID, mime: "image/jpeg", bytes, sha256 });
    for (const header of [`"${sha256}"`, `W/"${sha256}"`, `"otro", "${sha256}"`]) {
      const res = await GET(...readRequest(STAFF_ID, { "if-none-match": header }));
      expect(res.status).toBe(304);
      expect(res.headers.get("etag")).toBe(`"${sha256}"`);
      expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    }
  });

  it("200 when If-None-Match is stale", async () => {
    repo.findStaffPhoto.mockResolvedValue({ staffId: STAFF_ID, mime: "image/jpeg", bytes, sha256 });
    const res = await GET(...readRequest(STAFF_ID, { "if-none-match": '"viejo"' }));
    expect(res.status).toBe(200);
  });
});

// ── removeMyPhotoAction ─────────────────────────────────────────────────────

describe("removeMyPhotoAction", () => {
  it("is flagged implemented", () => {
    expect(IMPLEMENTED.removeMyPhotoAction).toBe(true);
  });

  it("deletes the caller's photo without revalidating the layout", async () => {
    await removeMyPhotoAction();
    expect(repo.deleteStaffPhoto).toHaveBeenCalledWith(expect.anything(), STAFF_ID);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects without a session and deletes nothing", async () => {
    session.value = { status: "guest", user: null };
    await expect(removeMyPhotoAction()).rejects.toThrow();
    expect(repo.deleteStaffPhoto).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("removeMyPhotoAction (ActionResult)", () => {
  it("returns { ok: true } after deleting the photo", async () => {
    await expect(profilePhotoActionsModule.removeMyPhotoAction()).resolves.toMatchObject({ ok: true });
    expect(repo.deleteStaffPhoto).toHaveBeenCalledWith(expect.anything(), STAFF_ID);
  });

  it("returns { ok: false, error: 'FORBIDDEN' } without a session instead of throwing", async () => {
    session.value = { status: "guest", user: null };
    await expect(profilePhotoActionsModule.removeMyPhotoAction()).resolves.toEqual({ ok: false, error: "FORBIDDEN" });
    expect(repo.deleteStaffPhoto).not.toHaveBeenCalled();
  });
});
