// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.values.has(name) ? { name, value: jar.values.get(name) } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const store = vi.hoisted(() => ({
  findActivePortalSession: vi.fn(),
  slidePortalSession: vi.fn(),
  findPortalProjectAccess: vi.fn(),
}));
vi.mock("@/lib/portal/session-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal/session-store")>()),
  ...store,
}));

const { insertValues, drive, guardMock } = vi.hoisted(() => ({
  insertValues: vi.fn(),
  drive: { get: vi.fn(), getMedia: vi.fn(), export: vi.fn() },
  guardMock: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ db: { insert: () => ({ values: insertValues }) } }));
vi.mock("@/lib/google/service-account", () => ({ getServiceAccountTokenSource: () => async () => "token" }));
vi.mock("@/lib/google/drive-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/drive-admin")>()),
  createDriveAdmin: () => drive,
}));
vi.mock("@/lib/portal/drive-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal/drive-guard")>()),
  assertInsideClientFolder: guardMock,
}));

import { PORTAL_SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { PortalNotFoundError } from "@/lib/portal/drive-guard";
import { GET as download } from "@/app/api/portal/projects/[pid]/files/[fileId]/download/route";
import { GET as preview } from "@/app/api/portal/projects/[pid]/files/[fileId]/preview/route";

const PID = "11111111-1111-4111-8111-111111111111";
const user = { id: "user-1", name: "Cliente", email: "cliente@gmail.com", contactId: "contact-1" };
const access = {
  accessId: "access-1",
  projectId: PID,
  name: "Casa",
  code: "P-01",
  status: "en_proceso",
  managerId: null,
  coordinatorId: null,
  driveFolderStatus: "ready",
  driveClientFolderId: "a-cliente",
  driveInboundFolderId: "a-inbound",
};

const ctx = (fileId: string, pid = PID) => ({ params: Promise.resolve({ pid, fileId }) });
const req = () =>
  new Request("http://localhost/api/portal/x", { headers: { "x-real-ip": "203.0.113.7", "user-agent": "Safari" } });

beforeEach(() => {
  vi.clearAllMocks();
  jar.values.clear();
  jar.values.set(PORTAL_SESSION_COOKIE, "token");
  store.findActivePortalSession.mockResolvedValue({ sessionId: "s-1", refreshedAt: new Date(), user });
  store.findPortalProjectAccess.mockResolvedValue(access);
  guardMock.mockResolvedValue([]);
  insertValues.mockResolvedValue(undefined);
  drive.get.mockResolvedValue({ id: "plano", name: "plano.pdf", mimeType: "application/pdf", size: "4" });
  drive.getMedia.mockResolvedValue({ body: new Response("%PDF").body, contentType: "application/pdf", size: 4 });
});

describe("portal file download and preview routes", () => {
  it("401 { redirect } with the portal cookie cleared without a portal session", async () => {
    jar.values.clear();
    const res = await download(req() as never, ctx("plano"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ redirect: "/portal/login" });
    expect(res.headers.get("set-cookie")).toContain(`${PORTAL_SESSION_COOKIE}=;`);
    expect(guardMock).not.toHaveBeenCalled();
  });

  it("404 without access to the project", async () => {
    store.findPortalProjectAccess.mockResolvedValue(null);
    for (const route of [download, preview]) {
      const res = await route(req() as never, ctx("plano"));
      expect(res.status).toBe(404);
    }
    expect(guardMock).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("404 for ids outside the client folder (01 Interno, another project)", async () => {
    guardMock.mockRejectedValue(new PortalNotFoundError());
    for (const route of [download, preview]) {
      const res = await route(req() as never, ctx("secreto"));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });
    }
    expect(drive.getMedia).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("runs the ancestry guard on the project's client folder and logs the download", async () => {
    const res = await download(req() as never, ctx("plano"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; /);
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none'");
    expect(guardMock).toHaveBeenCalledWith("plano", expect.objectContaining({ driveClientFolderId: "a-cliente" }));
    expect(insertValues).toHaveBeenCalledWith({
      portalUserId: "user-1",
      projectId: PID,
      driveFileId: "plano",
      fileName: "plano.pdf",
      sizeBytes: 4,
      action: "download",
      ip: "203.0.113.7",
      userAgent: "Safari",
    });
  });

  it("previews a PDF inline with the PDF CSP and logs a preview", async () => {
    const res = await preview(req() as never, ctx("plano"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline; /);
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; object-src 'self'");
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ action: "preview" }));
  });
});
