import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireCapabilityUserMock, getFileMetaMock, isDriveConfiguredMock } = vi.hoisted(() => ({
  requireCapabilityUserMock: vi.fn(),
  getFileMetaMock: vi.fn(),
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
}));

vi.mock("@/lib/google/drive-repository", () => ({
  getFileMeta: getFileMetaMock,
}));

import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  requireCapabilityUserMock.mockReset();
  getFileMetaMock.mockReset();
  isDriveConfiguredMock.mockReset();
  isDriveConfiguredMock.mockReturnValue(true);
});

describe("GET /api/google/drive/file/[id]", () => {
  it("401 without a session", async () => {
    requireCapabilityUserMock.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await GET(new Request("http://x") as never, ctx("f1"));
    expect(res.status).toBe(401);
  });

  it("passes the caller's institutional email through to getFileMeta", async () => {
    requireCapabilityUserMock.mockResolvedValue({ email: "ana@cincel.mx" });
    getFileMetaMock.mockResolvedValue({ id: "f1", name: "doc" });

    await GET(new Request("http://x") as never, ctx("f1"));

    expect(getFileMetaMock).toHaveBeenCalledWith("ana@cincel.mx", "f1");
  });

  it("403 when the caller has no institutional email on file", async () => {
    requireCapabilityUserMock.mockResolvedValue({ email: "" });
    const res = await GET(new Request("http://x") as never, ctx("f1"));
    expect(res.status).toBe(403);
    expect(getFileMetaMock).not.toHaveBeenCalled();
  });

  it("503 when Drive isn't configured", async () => {
    isDriveConfiguredMock.mockReturnValue(false);
    requireCapabilityUserMock.mockResolvedValue({ email: "ana@cincel.mx" });
    const res = await GET(new Request("http://x") as never, ctx("f1"));
    expect(res.status).toBe(503);
  });
});
