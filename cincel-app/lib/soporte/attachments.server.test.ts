// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rows = vi.hoisted(() => ({ read: [] as unknown[] }));
const chain = vi.hoisted(() => {
  const c: Record<string, unknown> = {};
  for (const name of ["select", "from", "innerJoin", "where", "orderBy", "for"]) c[name] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(rows.read);
  return c;
});
vi.mock("@/lib/db/client", () => ({ db: { select: () => chain, transaction: vi.fn() } }));

import { readTicketAttachment, sanitizeAttachment } from "@/lib/soporte/attachments";
import { ATTACHMENT_ERRORS, ATTACHMENT_MAX_BYTES } from "@/lib/soporte/attachments-rules";

// 1x1 png with a tEXt chunk.
function pngWithText(): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const chunk = (type: string, data: number[]) => {
    const len = data.length;
    return [len >>> 24, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  };
  const ihdr = chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const text = chunk("tEXt", [...Buffer.from("Author\0someone")]);
  const idat = chunk("IDAT", [0x78, 0x9c, 0x63, 0, 1, 0, 0, 5, 0, 1]);
  const iend = chunk("IEND", []);
  return new Uint8Array([...sig, ...ihdr, ...text, ...idat, ...iend]);
}

describe("sanitizeAttachment", () => {
  it("strips metadata chunks and reports the real type", async () => {
    const result = await sanitizeAttachment(pngWithText());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mime).toBe("image/png");
      expect(Buffer.from(result.bytes).includes(Buffer.from("tEXt"))).toBe(false);
    }
  });

  it("rejects non-images whatever the extension says", async () => {
    expect(await sanitizeAttachment(new TextEncoder().encode("hello world, not an image"))).toEqual({
      ok: false,
      error: ATTACHMENT_ERRORS.invalidType,
    });
  });

  it("rejects empty and oversized files", async () => {
    expect(await sanitizeAttachment(new Uint8Array())).toEqual({ ok: false, error: ATTACHMENT_ERRORS.empty });
    expect(await sanitizeAttachment(new Uint8Array(ATTACHMENT_MAX_BYTES + 1))).toEqual({
      ok: false,
      error: ATTACHMENT_ERRORS.tooLarge,
    });
  });
});

describe("readTicketAttachment", () => {
  const AUTHOR = "11111111-1111-4111-8111-111111111111";
  const row = { mime: "image/png", name: "a.png", createdBy: AUTHOR, bytes: Buffer.from([1, 2, 3]) };
  beforeEach(() => {
    rows.read = [row];
  });

  it("serves the author and an admin", async () => {
    expect(await readTicketAttachment({ staffId: AUTHOR, canManageSupport: false }, "x")).toMatchObject({ mime: "image/png" });
    expect(await readTicketAttachment({ staffId: "other", canManageSupport: true }, "x")).not.toBeNull();
  });

  it("returns null for another user and for a missing attachment", async () => {
    expect(await readTicketAttachment({ staffId: "other", canManageSupport: false }, "x")).toBeNull();
    rows.read = [];
    expect(await readTicketAttachment({ staffId: AUTHOR, canManageSupport: true }, "x")).toBeNull();
  });
});
