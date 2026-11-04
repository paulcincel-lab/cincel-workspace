// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  inboundFileName,
  isAllowedUploadExtension,
  isDxfText,
  sniffUpload,
  uploadDatePrefix,
  uploadExtension,
} from "@/lib/portal/upload-validation";

const ascii = (text: string) => new TextEncoder().encode(text);

function bytes(...parts: (number[] | string | Uint8Array)[]): Uint8Array {
  const chunks = parts.map((part) =>
    typeof part === "string" ? ascii(part) : part instanceof Uint8Array ? part : Uint8Array.from(part)
  );
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

const pad = (head: Uint8Array, size = 512) => bytes(head, new Uint8Array(Math.max(0, size - head.length)));

const PDF = ascii("%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\n");
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], "IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const JPEG = pad(bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], "JFIF", [0]));
const HEIC = pad(bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0], "mif1heic"));
/** A ZIP local file header for a stored `a.txt` holding "hi". */
const ZIP = bytes(
  "PK",
  [3, 4, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 5, 0, 0, 0],
  "a.txt",
  "hi"
);
const CFB = pad(bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
const EXE = pad(bytes("MZ", [0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff]));
const DWG = pad(bytes("AC1032", [0, 0, 0, 0, 0, 0]));
const DXF = ascii("  0\r\nSECTION\r\n  2\r\nHEADER\r\n  9\r\n$ACADVER\r\n  1\r\nAC1032\r\n");

describe("upload extension allowlist", () => {
  it("reads the lowercase extension", () => {
    expect(uploadExtension("Plano Final.PDF")).toBe("pdf");
    expect(uploadExtension("archivo")).toBeNull();
    expect(uploadExtension(".bashrc")).toBeNull();
    expect(uploadExtension("raro.")).toBeNull();
  });

  it.each(["a.pdf", "a.jpg", "a.jpeg", "a.png", "a.heic", "a.docx", "a.xlsx", "a.pptx", "a.zip", "a.doc", "a.xls",
    "a.ppt", "a.dwg", "a.dxf"])("allows %s", (name) => {
    expect(isAllowedUploadExtension(name)).toBe(true);
  });

  it.each(["a.exe", "a.bat", "a.sh", "a.js", "a.html", "a.svg", "a.msi", "a.toString", "a.constructor"])(
    "rejects %s",
    (name) => {
      expect(isAllowedUploadExtension(name)).toBe(false);
    }
  );
});

describe("sniffUpload", () => {
  it.each([
    ["plano.pdf", PDF, "application/pdf"],
    ["foto.png", PNG, "image/png"],
    ["foto.jpg", JPEG, "image/jpeg"],
    ["foto.JPEG", JPEG, "image/jpeg"],
    ["foto.heic", HEIC, "image/heic"],
    ["fotos.zip", ZIP, "application/zip"],
    ["contrato.docx", ZIP, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["presupuesto.xlsx", ZIP, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["viejo.doc", CFB, "application/msword"],
    ["viejo.xls", CFB, "application/vnd.ms-excel"],
    ["viejo.ppt", CFB, "application/vnd.ms-powerpoint"],
    ["planta.dwg", DWG, "image/vnd.dwg"],
    ["planta.dxf", DXF, "image/vnd.dxf"],
  ])("accepts %s with matching content", async (name, head, mimeType) => {
    await expect(sniffUpload(name, head)).resolves.toMatchObject({ ok: true, mimeType });
  });

  it("rejects a renamed executable", async () => {
    await expect(sniffUpload("factura.pdf", EXE)).resolves.toEqual({ ok: false });
    await expect(sniffUpload("planta.dwg", EXE)).resolves.toEqual({ ok: false });
    await expect(sniffUpload("planta.dxf", EXE)).resolves.toEqual({ ok: false });
    await expect(sniffUpload("contrato.docx", EXE)).resolves.toEqual({ ok: false });
  });

  it("rejects an executable extension even with allowed content", async () => {
    await expect(sniffUpload("setup.exe", PDF)).resolves.toEqual({ ok: false });
  });

  it("rejects content that doesn't match the extension", async () => {
    await expect(sniffUpload("foto.png", PDF)).resolves.toEqual({ ok: false });
    await expect(sniffUpload("plano.pdf", PNG)).resolves.toEqual({ ok: false });
    await expect(sniffUpload("viejo.doc", ZIP)).resolves.toEqual({ ok: false });
    await expect(sniffUpload("fotos.zip", CFB)).resolves.toEqual({ ok: false });
  });

  it("rejects an empty file", async () => {
    await expect(sniffUpload("plano.pdf", new Uint8Array())).resolves.toEqual({ ok: false });
    await expect(sniffUpload("planta.dxf", new Uint8Array())).resolves.toEqual({ ok: false });
  });

  it("requires the AC10 header for dwg", async () => {
    await expect(sniffUpload("planta.dwg", pad(ascii("AC09xx")))).resolves.toEqual({ ok: false });
    await expect(sniffUpload("planta.dwg", ascii("AC1"))).resolves.toEqual({ ok: false });
  });
});

describe("isDxfText", () => {
  it("accepts leading whitespace, a BOM and LF line endings", () => {
    expect(isDxfText(ascii("\n\n  0\nSECTION\n  2\nENTITIES\n"))).toBe(true);
    expect(isDxfText(bytes([0xef, 0xbb, 0xbf], "0\nSECTION\n"))).toBe(true);
  });

  it("tolerates a multi-byte character cut at the end of the head", () => {
    const head = bytes("  0\nSECTION\n999\nCasa ", [0xc3]);
    expect(isDxfText(head)).toBe(true);
  });

  it("rejects text that doesn't start with 0 / SECTION, binary DXF and invalid UTF-8", () => {
    expect(isDxfText(ascii("999\ncomentario\n  0\nSECTION\n"))).toBe(false);
    expect(isDxfText(ascii("  0\nSECTIONS\n"))).toBe(false);
    expect(isDxfText(bytes("AutoCAD Binary DXF\r\n", [0x1a, 0]))).toBe(false);
    expect(isDxfText(bytes("  0\nSECTION\n", [0xff, 0xfe, 0x41]))).toBe(false);
  });
});

describe("inbound file names", () => {
  it("uses the America/Mexico_City date", () => {
    // 03:00 UTC on the 4th is still the evening of the 3rd in Mexico City.
    expect(uploadDatePrefix(new Date("2026-11-04T03:00:00Z"))).toBe("2026-11-03");
    expect(uploadDatePrefix(new Date("2026-11-04T07:00:00Z"))).toBe("2026-11-04");
  });

  it("prefixes the date and the client name", () => {
    expect(inboundFileName(new Date("2026-11-04T18:00:00Z"), "Ana López", "Plano cocina.pdf")).toBe(
      "2026-11-04 · Ana López · Plano cocina.pdf"
    );
  });

  it("sanitizes path separators, control characters and the separator in the client name", () => {
    const name = inboundFileName(new Date("2026-11-04T18:00:00Z"), "Ana · Pérez/Gómez", "../../etc/pass\u0000wd.pdf");
    expect(name).toBe("2026-11-04 · Ana - Pérez_Gómez · _.._etc_passwd.pdf");
    expect(name).not.toMatch(/[\\/\u0000]/);
  });
});
