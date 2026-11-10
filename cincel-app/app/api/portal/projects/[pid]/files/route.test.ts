// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePortalApiUserMock,
  requireProjectAccessMock,
  listPortalFolderMock,
  FakeUnauthorized,
  FakeNotFound,
  FakeDriveUnavailable,
} = vi.hoisted(() => ({
  requirePortalApiUserMock: vi.fn(),
  requireProjectAccessMock: vi.fn(),
  listPortalFolderMock: vi.fn(),
  FakeUnauthorized: class FakeUnauthorized extends Error {},
  FakeNotFound: class FakeNotFound extends Error {},
  FakeDriveUnavailable: class FakeDriveUnavailable extends Error {},
}));

vi.mock("@/lib/portal/session", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requirePortalApiUser: requirePortalApiUserMock,
    requireProjectAccess: requireProjectAccessMock,
    portalErrorResponse: (error: unknown) => {
      if (error instanceof FakeUnauthorized) return NextResponse.json({ redirect: "/portal/login" }, { status: 401 });
      if (error instanceof FakeNotFound) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return null;
    },
  };
});

vi.mock("@/lib/portal/files", () => ({
  listPortalFolder: listPortalFolderMock,
  PortalDriveUnavailableError: FakeDriveUnavailable,
}));

import { NextRequest } from "next/server";

import { GET } from "./route";

const PID = "11111111-1111-4111-8111-111111111111";
const user = { id: "pu-1", name: "Ana", email: "ana@example.com", contactId: "c-1", companyName: null };
const readyProject = {
  accessId: "acc-1",
  projectId: PID,
  driveFolderStatus: "ready",
  driveClientFolderId: "a-cliente",
  driveInboundFolderId: "a-inbound",
};
const listing = {
  folderId: "a-cliente",
  breadcrumbs: [{ id: "a-cliente", name: "Archivos" }],
  items: [
    {
      id: "plano",
      name: "plano.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      modifiedAt: "2026-11-01T10:00:00.000Z",
      kind: "file",
      deliveredAs: "original",
    },
  ],
};

function call(query = "") {
  const request = new NextRequest(`http://localhost/api/portal/projects/${PID}/files${query}`);
  return GET(request, { params: Promise.resolve({ pid: PID }) });
}

beforeEach(() => {
  requirePortalApiUserMock.mockReset().mockResolvedValue(user);
  requireProjectAccessMock.mockReset().mockResolvedValue(readyProject);
  listPortalFolderMock.mockReset().mockResolvedValue(listing);
});

describe("GET /api/portal/projects/[pid]/files", () => {
  it("lists the client folder and is never cached by the browser", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(listing);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(requireProjectAccessMock).toHaveBeenCalledWith(PID, user);
    expect(listPortalFolderMock).toHaveBeenCalledWith({ driveClientFolderId: "a-cliente" }, null);
  });

  it("passes the folder param through the ancestry-checked lister", async () => {
    await call("?folder=sub");
    expect(listPortalFolderMock).toHaveBeenCalledWith({ driveClientFolderId: "a-cliente" }, "sub");
  });

  it.each(["pending", "failed"])("answers { pending: true } while the folder status is %s", async (status) => {
    requireProjectAccessMock.mockResolvedValue({ ...readyProject, driveFolderStatus: status });
    const response = await call("?folder=sub");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pending: true });
    expect(listPortalFolderMock).not.toHaveBeenCalled();
  });

  it("answers { pending: true } when a ready project has no client folder id", async () => {
    requireProjectAccessMock.mockResolvedValue({ ...readyProject, driveClientFolderId: null });
    expect(await (await call()).json()).toEqual({ pending: true });
  });

  it("answers 401 { redirect } without a portal session", async () => {
    requirePortalApiUserMock.mockRejectedValue(new FakeUnauthorized());
    const response = await call();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ redirect: "/portal/login" });
    expect(listPortalFolderMock).not.toHaveBeenCalled();
  });

  it("answers 404 without project access", async () => {
    requireProjectAccessMock.mockRejectedValue(new FakeNotFound());
    expect((await call()).status).toBe(404);
    expect(listPortalFolderMock).not.toHaveBeenCalled();
  });

  it("answers 404 for a folder outside 02 Cliente (01 Interno, another project)", async () => {
    listPortalFolderMock.mockRejectedValue(new FakeNotFound());
    const response = await call("?folder=a-interno");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("answers 503 when the service account isn't configured", async () => {
    listPortalFolderMock.mockRejectedValue(new FakeDriveUnavailable());
    expect((await call()).status).toBe(503);
  });

  it("rethrows unexpected errors", async () => {
    listPortalFolderMock.mockRejectedValue(new Error("boom"));
    await expect(call()).rejects.toThrow("boom");
  });
});
