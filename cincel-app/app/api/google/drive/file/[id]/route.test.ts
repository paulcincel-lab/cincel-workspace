import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  requireCapabilityUserMock,
  getFileMetaMock,
  isDriveConfiguredMock,
  isOauthConfiguredMock,
  getGoogleOauthAccountMock,
} = vi.hoisted(() => ({
  requireCapabilityUserMock: vi.fn(),
  getFileMetaMock: vi.fn(),
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
}));

vi.mock("@/lib/google/oauth", () => ({
  isOauthConfigured: isOauthConfiguredMock,
}));

vi.mock("@/lib/repositories/google-oauth-repository", () => ({
  getGoogleOauthAccount: getGoogleOauthAccountMock,
}));

vi.mock("@/lib/google/drive-repository", () => ({
  getFileMeta: getFileMetaMock,
}));

import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const caller = (email: string) => ({ member: { id: "staff-1" }, email });

beforeEach(() => {
  requireCapabilityUserMock.mockReset();
  getFileMetaMock.mockReset();
  isDriveConfiguredMock.mockReset();
  isOauthConfiguredMock.mockReset();
  getGoogleOauthAccountMock.mockReset();
  isDriveConfiguredMock.mockReturnValue(true);
  isOauthConfiguredMock.mockReturnValue(false);
  getGoogleOauthAccountMock.mockResolvedValue(null);
});

describe("GET /api/google/drive/file/[id]", () => {
  it("401 without a session", async () => {
    requireCapabilityUserMock.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await GET(new Request("http://x") as never, ctx("f1"));
    expect(res.status).toBe(401);
  });

  it("passes the caller's staffId and institutional email through to getFileMeta", async () => {
    requireCapabilityUserMock.mockResolvedValue(caller("ana@cincel.mx"));
    getFileMetaMock.mockResolvedValue({ id: "f1", name: "doc" });

    await GET(new Request("http://x") as never, ctx("f1"));

    expect(getFileMetaMock).toHaveBeenCalledWith({ staffId: "staff-1", email: "ana@cincel.mx" }, "f1");
  });

  it("403 when the caller has no institutional email and no connected Google account", async () => {
    requireCapabilityUserMock.mockResolvedValue(caller(""));
    const res = await GET(new Request("http://x") as never, ctx("f1"));
    expect(res.status).toBe(403);
    expect(getFileMetaMock).not.toHaveBeenCalled();
  });

  it("503 when neither the service account nor OAuth is configured", async () => {
    isDriveConfiguredMock.mockReturnValue(false);
    isOauthConfiguredMock.mockReturnValue(false);
    requireCapabilityUserMock.mockResolvedValue(caller("ana@cincel.mx"));
    const res = await GET(new Request("http://x") as never, ctx("f1"));
    expect(res.status).toBe(503);
  });
});
