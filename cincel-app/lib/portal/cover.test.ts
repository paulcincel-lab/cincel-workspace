// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { DriveAdminError, type DriveFile, type MediaResponse } from "@/lib/google/drive-admin";
import { createDriveGuard } from "@/lib/portal/drive-guard";
import type { PortalProjectAccess } from "@/lib/portal/session-store";

import { deliverPortalCover, type PortalCoverDeps } from "./cover";

/** proj-a / 02 Cliente → foto.jpg, plano.pdf; 01 Interno → interna.jpg */
type Node = { name: string; parent: string; mimeType: string; size?: string };
const FOLDER = "application/vnd.google-apps.folder";
const tree: Record<string, Node> = {
  "proj-a": { name: "P-01", parent: "root", mimeType: FOLDER },
  "a-cliente": { name: "02 Cliente", parent: "proj-a", mimeType: FOLDER },
  "a-interno": { name: "01 Interno", parent: "proj-a", mimeType: FOLDER },
  foto: { name: "foto.jpg", parent: "a-cliente", mimeType: "image/jpeg", size: "4" },
  plano: { name: "plano.pdf", parent: "a-cliente", mimeType: "application/pdf", size: "4" },
  interna: { name: "interna.jpg", parent: "a-interno", mimeType: "image/jpeg", size: "4" },
};

function toFile(id: string): DriveFile {
  const node = tree[id];
  if (!node) throw new DriveAdminError("File not found", 404, "notFound");
  return { id, name: node.name, mimeType: node.mimeType, parents: [node.parent], trashed: false, size: node.size };
}

function media(contentType: string): MediaResponse {
  return { body: new Response("img!").body as ReadableStream<Uint8Array>, contentType, size: 4 };
}

const drive = {
  get: vi.fn(async (id: string) => toFile(id)),
  getMedia: vi.fn(async (id: string) => media(toFile(id).mimeType)),
  export: vi.fn(async () => media("application/pdf")),
};
const guard = createDriveGuard({ getDrive: () => drive });

const access = { projectId: "p1", driveClientFolderId: "a-cliente" } as PortalProjectAccess;

function deps(cover: string | null): PortalCoverDeps {
  return {
    assertInsideClientFolder: (id, project) => guard.assertInsideClientFolder(id, project),
    drive,
    getCoverFileId: vi.fn(async () => cover),
  };
}

describe("deliverPortalCover", () => {
  it("serves the cover image inline from 02 Cliente", async () => {
    const response = await deliverPortalCover({ access, portalUserId: "u1" }, deps("foto"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Content-Disposition")).toMatch(/^inline/);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  it("is a 404 without a cover, outside 02 Cliente, or for a file that is not an image", async () => {
    for (const cover of [null, "interna", "plano", "desconocido"]) {
      const response = await deliverPortalCover({ access, portalUserId: "u1" }, deps(cover));
      expect(response.status, String(cover)).toBe(404);
    }
  });
});
