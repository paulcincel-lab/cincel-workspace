import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireCapabilityUserMock, getFileMetaMock, getStaffAccessTokenMock, staffOauthConfigMock } = vi.hoisted(() => ({
  requireCapabilityUserMock: vi.fn(),
  getFileMetaMock: vi.fn(),
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
vi.mock("@/lib/google/drive-repository", () => ({ getFileMeta: getFileMetaMock }));

import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const caller = (email: string) => ({ member: { id: "staff-1" }, email });
const call = () => GET(new Request("http://x") as never, ctx("f1"));

beforeEach(() => {
  vi.resetAllMocks();
  staffOauthConfigMock.mockReturnValue({ clientId: "id", clientSecret: "s", redirectUri: "r", workspaceDomain: "cincel.mx" });
  getStaffAccessTokenMock.mockResolvedValue({ status: "ok", accessToken: "staff-at" });
  requireCapabilityUserMock.mockResolvedValue(caller("ana@cincel.mx"));
});

describe("GET /api/google/drive/file/[id]", () => {
  it("401 without a session", async () => {
    requireCapabilityUserMock.mockRejectedValue(new Error("FORBIDDEN"));
    expect((await call()).status).toBe(401);
  });

  it("reads metadata with the staff member's own token", async () => {
    getFileMetaMock.mockResolvedValue({ id: "f1", name: "doc" });

    const res = await call();

    expect(res.status).toBe(200);
    expect(getFileMetaMock).toHaveBeenCalledWith({ staffId: "staff-1", email: "ana@cincel.mx", accessToken: "staff-at" }, "f1");
  });

  it("403 { error: needs_consent } without a Drive grant", async () => {
    getStaffAccessTokenMock.mockResolvedValue({ status: "needs_consent" });

    const res = await call();

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "needs_consent" });
    expect(getFileMetaMock).not.toHaveBeenCalled();
  });

  it("503 when the staff OAuth client isn't configured", async () => {
    staffOauthConfigMock.mockReturnValue(null);
    expect((await call()).status).toBe(503);
  });

  it("404 when Drive says the file isn't there", async () => {
    getFileMetaMock.mockRejectedValue(new Error("DRIVE_API_404: nope"));
    expect((await call()).status).toBe(404);
  });
});
