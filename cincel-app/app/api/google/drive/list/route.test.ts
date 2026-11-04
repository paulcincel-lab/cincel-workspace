import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireCapabilityUserMock, listFolderMock, searchFilesMock, getStaffAccessTokenMock, staffOauthConfigMock } =
  vi.hoisted(() => ({
    requireCapabilityUserMock: vi.fn(),
    listFolderMock: vi.fn(),
    searchFilesMock: vi.fn(),
    getStaffAccessTokenMock: vi.fn(),
    staffOauthConfigMock: vi.fn(),
  }));

vi.mock("@/lib/google/staff-token", () => ({ getStaffAccessToken: getStaffAccessTokenMock }));
vi.mock("@/lib/google/staff-oauth", () => ({ staffOauthConfig: staffOauthConfigMock }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: requireCapabilityUserMock }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveProjectsCapabilities: () => ({ canViewProjects: true }),
  resolveResourcesCapabilities: () => ({ canViewResources: true }),
}));
vi.mock("@/lib/google/drive-repository", () => ({ listFolder: listFolderMock, searchFiles: searchFilesMock }));

import { NextRequest } from "next/server";
import { GET } from "./route";

function req(url: string): NextRequest {
  return new NextRequest(url);
}

const caller = (email: string) => ({ member: { id: "staff-1" }, email });

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
  vi.stubEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID", "root-folder-id");
  staffOauthConfigMock.mockReturnValue({ clientId: "id", clientSecret: "s", redirectUri: "r", workspaceDomain: "cincel.mx" });
  getStaffAccessTokenMock.mockResolvedValue({ status: "ok", accessToken: "staff-at" });
  requireCapabilityUserMock.mockResolvedValue(caller("ana@cincel.mx"));
});

describe("GET /api/google/drive/list", () => {
  it("401 without a session", async () => {
    requireCapabilityUserMock.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await GET(req("http://x/api/google/drive/list"));
    expect(res.status).toBe(401);
    expect(getStaffAccessTokenMock).not.toHaveBeenCalled();
  });

  it("lists with the staff member's own token", async () => {
    listFolderMock.mockResolvedValue({ entries: [], nextPageToken: null });

    const res = await GET(req("http://x/api/google/drive/list?folderId=f1"));

    expect(res.status).toBe(200);
    expect(getStaffAccessTokenMock).toHaveBeenCalledWith("staff-1", "drive");
    expect(listFolderMock).toHaveBeenCalledWith(
      { staffId: "staff-1", email: "ana@cincel.mx", accessToken: "staff-at" },
      "f1",
      undefined
    );
  });

  it("searches from the root folder with the staff token", async () => {
    requireCapabilityUserMock.mockResolvedValue(caller("beto@cincel.mx"));
    searchFilesMock.mockResolvedValue([]);

    await GET(req("http://x/api/google/drive/list?q=contrato"));

    expect(searchFilesMock).toHaveBeenCalledWith(
      { staffId: "staff-1", email: "beto@cincel.mx", accessToken: "staff-at" },
      "contrato",
      "root-folder-id"
    );
  });

  it("falls back to the Shared Drive root when GOOGLE_DRIVE_ROOT_FOLDER_ID is unset", async () => {
    vi.stubEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID", "");
    vi.stubEnv("GOOGLE_SHARED_DRIVE_ID", "shared-1");
    listFolderMock.mockResolvedValue({ entries: [], nextPageToken: null });

    await GET(req("http://x/api/google/drive/list"));

    expect(listFolderMock).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "staff-at" }), "shared-1", undefined);
  });

  it("403 { error: needs_consent } without a Drive grant, even with an institutional email", async () => {
    getStaffAccessTokenMock.mockResolvedValue({ status: "needs_consent" });

    const res = await GET(req("http://x/api/google/drive/list?folderId=f1"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "needs_consent" });
    expect(listFolderMock).not.toHaveBeenCalled();
  });

  it("503 when Google sign-in is off", async () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "false");
    const res = await GET(req("http://x/api/google/drive/list?folderId=f1"));
    expect(res.status).toBe(503);
    expect(getStaffAccessTokenMock).not.toHaveBeenCalled();
  });

  it("503 when the staff OAuth client isn't configured", async () => {
    staffOauthConfigMock.mockReturnValue(null);
    const res = await GET(req("http://x/api/google/drive/list?folderId=f1"));
    expect(res.status).toBe(503);
    expect(getStaffAccessTokenMock).not.toHaveBeenCalled();
  });
});
