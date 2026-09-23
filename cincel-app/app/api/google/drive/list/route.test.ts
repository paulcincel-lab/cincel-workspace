import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  requireCapabilityUserMock,
  listFolderMock,
  searchFilesMock,
  isDriveConfiguredMock,
  isOauthConfiguredMock,
  getGoogleOauthAccountMock,
} = vi.hoisted(() => ({
  requireCapabilityUserMock: vi.fn(),
  listFolderMock: vi.fn(),
  searchFilesMock: vi.fn(),
  isDriveConfiguredMock: vi.fn(),
  isOauthConfiguredMock: vi.fn(),
  getGoogleOauthAccountMock: vi.fn(),
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

vi.mock("@/lib/google/oauth", () => ({
  isOauthConfigured: isOauthConfiguredMock,
}));

vi.mock("@/lib/repositories/google-oauth-repository", () => ({
  getGoogleOauthAccount: getGoogleOauthAccountMock,
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

const caller = (email: string) => ({ member: { id: "staff-1" }, email });

beforeEach(() => {
  requireCapabilityUserMock.mockReset();
  listFolderMock.mockReset();
  searchFilesMock.mockReset();
  isDriveConfiguredMock.mockReset();
  isOauthConfiguredMock.mockReset();
  getGoogleOauthAccountMock.mockReset();
  isDriveConfiguredMock.mockReturnValue(true);
  isOauthConfiguredMock.mockReturnValue(false);
  getGoogleOauthAccountMock.mockResolvedValue(null);
});

describe("GET /api/google/drive/list", () => {
  it("401 without a session", async () => {
    requireCapabilityUserMock.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await GET(req("http://x/api/google/drive/list"));
    expect(res.status).toBe(401);
  });

  it("passes the caller's staffId and institutional email through to listFolder", async () => {
    requireCapabilityUserMock.mockResolvedValue(caller("ana@cincel.mx"));
    listFolderMock.mockResolvedValue({ entries: [], nextPageToken: null });

    await GET(req("http://x/api/google/drive/list?folderId=f1"));

    expect(listFolderMock).toHaveBeenCalledWith({ staffId: "staff-1", email: "ana@cincel.mx" }, "f1", undefined);
  });

  it("passes the caller through to searchFiles", async () => {
    requireCapabilityUserMock.mockResolvedValue(caller("beto@cincel.mx"));
    searchFilesMock.mockResolvedValue([]);

    await GET(req("http://x/api/google/drive/list?q=contrato"));

    expect(searchFilesMock).toHaveBeenCalledWith(
      { staffId: "staff-1", email: "beto@cincel.mx" },
      "contrato",
      "root-folder-id"
    );
  });

  it("403 when the caller has no institutional email and no connected Google account", async () => {
    requireCapabilityUserMock.mockResolvedValue(caller(""));
    const res = await GET(req("http://x/api/google/drive/list?folderId=f1"));
    expect(res.status).toBe(403);
    expect(listFolderMock).not.toHaveBeenCalled();
  });

  it("allows a caller with no institutional email when they have a connected Google account", async () => {
    isOauthConfiguredMock.mockReturnValue(true);
    getGoogleOauthAccountMock.mockResolvedValue({ email: "personal@gmail.com" });
    requireCapabilityUserMock.mockResolvedValue(caller(""));
    listFolderMock.mockResolvedValue({ entries: [], nextPageToken: null });

    const res = await GET(req("http://x/api/google/drive/list?folderId=f1"));

    expect(res.status).toBe(200);
    expect(listFolderMock).toHaveBeenCalledWith({ staffId: "staff-1", email: "" }, "f1", undefined);
  });

  it("503 when neither the service account nor OAuth is configured", async () => {
    isDriveConfiguredMock.mockReturnValue(false);
    isOauthConfiguredMock.mockReturnValue(false);
    requireCapabilityUserMock.mockResolvedValue(caller("ana@cincel.mx"));
    const res = await GET(req("http://x/api/google/drive/list?folderId=f1"));
    expect(res.status).toBe(503);
  });
});
