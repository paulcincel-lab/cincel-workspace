// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DriveAdminError, type DriveFile, type MediaResponse } from "@/lib/google/drive-admin";
import { createDriveGuard } from "@/lib/portal/drive-guard";
import {
  asciiFilename,
  contentDisposition,
  contentSecurityPolicy,
  CSP_PDF_PREVIEW,
  CSP_SANDBOXED,
  deliverPortalFile,
  encodeRfc5987,
  EXPORT_TOO_LARGE_MESSAGE,
  exportedFilename,
  isPreviewable,
  sanitizeFilename,
  type PortalFileDeps,
  type PortalFileEventInput,
  type PortalFileKind,
} from "@/lib/portal/file-delivery";

/**
 * Fake Shared Drive:
 *   proj-a
 *   ├── a-interno (01 Interno) → secreto.pdf
 *   └── a-cliente (02 Cliente) → plano.pdf, foto.png, logo.svg, presupuesto (Doc), enorme (Doc),
 *                                 formulario (Form), notas.txt, Renders/ → render.jpg
 *   proj-b
 *   └── b-cliente (02 Cliente) → b-plano.pdf
 */
type Node = { name: string; parent: string; mimeType: string; size?: string; trashed?: boolean };
const FOLDER = "application/vnd.google-apps.folder";
const DOC = "application/vnd.google-apps.document";

const tree: Record<string, Node> = {
  "proj-a": { name: "P-01 · Casa", parent: "shared-root", mimeType: FOLDER },
  "a-interno": { name: "01 Interno", parent: "proj-a", mimeType: FOLDER },
  secreto: { name: "secreto.pdf", parent: "a-interno", mimeType: "application/pdf", size: "10" },
  "a-cliente": { name: "02 Cliente", parent: "proj-a", mimeType: FOLDER },
  plano: { name: "plano.pdf", parent: "a-cliente", mimeType: "application/pdf", size: "1234" },
  foto: { name: "foto.png", parent: "a-cliente", mimeType: "image/png", size: "50" },
  logo: { name: "logo.svg", parent: "a-cliente", mimeType: "image/svg+xml", size: "20" },
  notas: { name: "notas.txt", parent: "a-cliente", mimeType: "text/plain", size: "5" },
  presupuesto: { name: "Presupuesto", parent: "a-cliente", mimeType: DOC },
  enorme: { name: "Bitácora", parent: "a-cliente", mimeType: DOC },
  formulario: { name: "Encuesta", parent: "a-cliente", mimeType: "application/vnd.google-apps.form" },
  renders: { name: "Renders", parent: "a-cliente", mimeType: FOLDER },
  render: { name: "render.jpg", parent: "renders", mimeType: "image/jpeg", size: "77" },
  viejo: { name: "viejo.pdf", parent: "a-cliente", mimeType: "application/pdf", trashed: true },
  "proj-b": { name: "P-02 · Depa", parent: "shared-root", mimeType: FOLDER },
  "b-cliente": { name: "02 Cliente", parent: "proj-b", mimeType: FOLDER },
  "b-plano": { name: "b-plano.pdf", parent: "b-cliente", mimeType: "application/pdf", size: "9" },
};

const notFound = () => new DriveAdminError("File not found", 404, "notFound");

function toFile(id: string): DriveFile {
  const node = tree[id];
  if (!node) throw notFound();
  return { id, name: node.name, mimeType: node.mimeType, parents: [node.parent], trashed: !!node.trashed, size: node.size };
}

function media(text: string, contentType: string): MediaResponse {
  return { body: new Response(text).body as ReadableStream<Uint8Array>, contentType, size: text.length };
}

const drive = {
  get: vi.fn(async (id: string) => toFile(id)),
  getMedia: vi.fn(async (id: string) => media(`bytes:${id}`, toFile(id).mimeType)),
  export: vi.fn(async (id: string) => {
    if (id === "enorme") throw new DriveAdminError("This file is too large to be exported.", 403, "exportSizeLimitExceeded");
    return media(`%PDF:${id}`, "application/pdf");
  }),
};

const guard = createDriveGuard({ getDrive: () => drive });
const events: PortalFileEventInput[] = [];
let deps: PortalFileDeps;

const projectA: { projectId: string; driveClientFolderId: string | null } = { projectId: "11111111-1111-1111-1111-111111111111", driveClientFolderId: "a-cliente" };

function deliver(fileId: string, kind: PortalFileKind = "download", project = projectA) {
  return deliverPortalFile(
    { kind, fileId, project, portalUserId: "user-1", ip: "203.0.113.7", userAgent: "Firefox" },
    deps
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  guard.clearCache();
  events.length = 0;
  deps = {
    assertInsideClientFolder: (id, project) => guard.assertInsideClientFolder(id, project),
    drive,
    recordEvent: vi.fn(async (event: PortalFileEventInput) => {
      events.push(event);
    }),
  };
});

describe("filename helpers", () => {
  it("strips control characters, path separators and reserved characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(sanitizeFilename('a\u0000b\r\n"c".pdf')).toBe("ab_c_.pdf");
    expect(sanitizeFilename("  plano final.pdf.  ")).toBe("plano final.pdf");
    expect(sanitizeFilename("   ")).toBe("archivo");
  });

  it("caps long names and keeps the extension", () => {
    const name = sanitizeFilename(`${"a".repeat(300)}.pdf`);
    expect(name.length).toBe(200);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("builds an ASCII fallback without quotes, backslashes or accents", () => {
    expect(asciiFilename("Diseño cocina.pdf")).toBe("Diseno cocina.pdf");
    expect(asciiFilename("日本.pdf")).toBe("__.pdf");
  });

  it("encodes RFC 5987 values, including the characters encodeURIComponent leaves", () => {
    expect(encodeRfc5987("it's (v2)*.pdf")).toBe("it%27s%20%28v2%29%2A.pdf");
  });

  it("writes an RFC 6266 header with both filename parameters", () => {
    expect(contentDisposition("attachment", "Diseño cocina.pdf")).toBe(
      `attachment; filename="Diseno cocina.pdf"; filename*=UTF-8''Dise%C3%B1o%20cocina.pdf`
    );
    expect(contentDisposition("inline", 'x"; filename="evil.html')).toBe(
      `inline; filename="x_; filename=_evil.html"; filename*=UTF-8''x_%3B%20filename%3D_evil.html`
    );
  });

  it("names exports as PDF", () => {
    expect(exportedFilename("Presupuesto")).toBe("Presupuesto.pdf");
    expect(exportedFilename("Acta.PDF")).toBe("Acta.PDF");
  });
});

describe("content type rules", () => {
  it("previews only PDF, JPEG, PNG, WebP and GIF", () => {
    for (const type of ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "IMAGE/PNG; q=1"]) {
      expect(isPreviewable(type)).toBe(true);
    }
    for (const type of ["image/svg+xml", "text/html", "text/plain", "application/zip", ""]) {
      expect(isPreviewable(type)).toBe(false);
    }
  });

  it("sandboxes downloads and image previews; PDF previews drop sandbox", () => {
    expect(contentSecurityPolicy("download", "application/pdf")).toBe("sandbox; default-src 'none'");
    expect(contentSecurityPolicy("download", "image/png")).toBe(CSP_SANDBOXED);
    expect(contentSecurityPolicy("preview", "image/png")).toBe(CSP_SANDBOXED);
    expect(contentSecurityPolicy("preview", "application/pdf")).toBe("default-src 'none'; object-src 'self'");
    expect(CSP_PDF_PREVIEW).not.toContain("sandbox");
  });
});

describe("deliverPortalFile", () => {
  it("streams a binary download with the attachment headers and logs the event", async () => {
    const res = await deliver("plano");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("bytes:plano");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="plano.pdf"; filename*=UTF-8''plano.pdf`);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toBe(CSP_SANDBOXED);
    expect(res.headers.get("Content-Length")).toBe("1234");
    expect(drive.getMedia).toHaveBeenCalledWith("plano");
    expect(events).toEqual([
      {
        portalUserId: "user-1",
        projectId: projectA.projectId,
        driveFileId: "plano",
        fileName: "plano.pdf",
        sizeBytes: 1234,
        action: "download",
        ip: "203.0.113.7",
        userAgent: "Firefox",
      },
    ]);
  });

  it("streams files in nested folders under 02 Cliente", async () => {
    const res = await deliver("render", "preview");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline; /);
    expect(res.headers.get("Content-Security-Policy")).toBe(CSP_SANDBOXED);
  });

  it("previews a PDF inline without sandbox", async () => {
    const res = await deliver("plano", "preview");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline; /);
    expect(res.headers.get("Content-Security-Policy")).toBe(CSP_PDF_PREVIEW);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(events.map((e) => e.action)).toEqual(["preview"]);
  });

  it("exports a Google Doc to PDF for download and preview", async () => {
    const res = await deliver("presupuesto");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("%PDF:presupuesto");
    expect(drive.export).toHaveBeenCalledWith("presupuesto", "application/pdf");
    expect(drive.getMedia).not.toHaveBeenCalled();
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("filename*=UTF-8''Presupuesto.pdf");
    expect(res.headers.get("Content-Length")).toBeNull();
    expect(events[0]).toMatchObject({ fileName: "Presupuesto.pdf", action: "download" });

    const preview = await deliver("presupuesto", "preview");
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Content-Security-Policy")).toBe(CSP_PDF_PREVIEW);
  });

  it("returns 422 export_too_large past Drive's 10 MB export limit and logs nothing", async () => {
    const res = await deliver("enorme");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "export_too_large", message: EXPORT_TOO_LARGE_MESSAGE });
    expect(events).toEqual([]);
  });

  it("returns 415 on preview for non-previewable types, SVG included", async () => {
    for (const id of ["logo", "notas"]) {
      const res = await deliver(id, "preview");
      expect(res.status).toBe(415);
      expect(await res.json()).toEqual({ error: "unsupported_type" });
    }
    expect(drive.getMedia).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("still downloads non-previewable types, sandboxed", async () => {
    const res = await deliver("logo");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; /);
    expect(res.headers.get("Content-Security-Policy")).toBe(CSP_SANDBOXED);
  });

  it("returns 415 for Google-native types that can't be exported", async () => {
    expect((await deliver("formulario")).status).toBe(415);
  });

  it("returns 400 for folders", async () => {
    const res = await deliver("renders");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "is_folder" });
  });

  it("returns 404 for 01 Interno, another project, trashed and unknown ids, without touching content", async () => {
    for (const id of ["secreto", "a-interno", "b-plano", "viejo", "no-existe", "proj-a"]) {
      for (const kind of ["download", "preview"] as const) {
        const res = await deliver(id, kind);
        expect(res.status, `${kind} ${id}`).toBe(404);
        expect(await res.json()).toEqual({ error: "not_found" });
      }
    }
    expect(drive.getMedia).not.toHaveBeenCalled();
    expect(drive.export).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("returns 404 when the project has no client folder yet or Drive isn't configured", async () => {
    expect((await deliver("plano", "download", { ...projectA, driveClientFolderId: null })).status).toBe(404);
    deps.drive = null;
    expect((await deliver("plano")).status).toBe(404);
  });

  it("fails without serving the file when the event can't be written", async () => {
    deps.recordEvent = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(deliver("plano")).rejects.toThrow("db down");
  });

  it("rethrows unexpected Drive errors", async () => {
    drive.getMedia.mockRejectedValueOnce(new DriveAdminError("Backend error", 500));
    await expect(deliver("plano")).rejects.toThrow("Backend error");
  });
});
