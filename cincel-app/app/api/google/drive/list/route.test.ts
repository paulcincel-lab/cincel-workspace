import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireCapabilityUserMock, listFolderMock, searchFilesMock, isDriveConfiguredMock } =
  vi.hoisted(() => ({
    requireCapabilityUserMock: vi.fn(),
    listFolderMock: vi.fn(),
    searchFilesMock: vi.fn(),
    isDriveConfiguredMock: vi.fn(),
  }));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: requireCapabilityUserMock,
}));

vi.mock("@/lib/auth/permissions", () => ({
  resolveProjectsCapabilities: () => ({ canViewProjects: true }),
  resolveResourcesCapabilities: () => ({ canViewResources: true }),
}));

vi.mock("@/lib/google/client", () => ({
  isDriveConfigured: isDriveConfiguredMock,
  getDriveRootFolderId: () => "root-folder-id",
}));

vi.mock("@/lib/google/drive-repository", () => ({
  listFolder: listFolderMock,
  searchFiles: searchFilesMock,
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

function req(url: string): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  requireCapabilityUserMock.mockReset();
  listFolderMock.mockReset();
  searchFilesMock.mockReset();
  isDriveConfiguredMock.mockReset();
  isDriveConfiguredMock.mockReturnValue(true);
});

describe("GET /api/google/drive/list", () => {
  it("401 without a session", async () => {
    requireCapabilityUserMock.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await GET(req("http://x/api/google/drive/list"));
    expect(res.status).toBe(401);
  });

  it("passes the caller's institutional email through to listFolder", async () => {
    requireCapabilityUserMock.mockResolvedValue({ email: "ana@cincel.mx" });
    listFolderMock.mockResolvedValue({ entries: [], nextPageToken: null });

    await GET(req("http://x/api/google/drive/list?folderId=f1"));

    expect(listFolderMock).toHaveBeenCalledWith("ana@cincel.mx", "f1", undefined);
  });

  it("passes the caller's email through to searchFiles", async () => {
    requireCapabilityUserMock.mockResolvedValue({ email: "beto@cincel.mx" });
    searchFilesMock.mockResolvedValue([]);

    await GET(req("http://x/api/google/drive/list?q=contrato"));

    expect(searchFilesMock).toHaveBeenCalledWith("beto@cincel.mx", "contrato", "root-folder-id");
  });

  it("403 when the caller has no institutional email on file", async () => {
    requireCapabilityUserMock.mockResolvedValue({ email: "" });
    const res = await GET(req("http://x/api/google/drive/list?folderId=f1"));
    expect(res.status).toBe(403);
    expect(listFolderMock).not.toHaveBeenCalled();
  });

  it("503 when Drive isn't configured", async () => {
    isDriveConfiguredMock.mockReturnValue(false);
    requireCapabilityUserMock.mockResolvedValue({ email: "ana@cincel.mx" });
    const res = await GET(req("http://x/api/google/drive/list?folderId=f1"));
    expect(res.status).toBe(503);
  });
});
