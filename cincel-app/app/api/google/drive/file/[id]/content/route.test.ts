import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  requireCapabilityUserMock,
  getFileContentMock,
  isDriveConfiguredMock,
  isOauthConfiguredMock,
  getGoogleOauthAccountMock,
} = vi.hoisted(() => ({
  requireCapabilityUserMock: vi.fn(),
  getFileContentMock: vi.fn(),
  isDriveConfiguredMock: vi.fn(),
  isOauthConfiguredMock: vi.fn(),
  getGoogleOauthAccountMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: requireCapabilityUserMock }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveProjectsCapabilities: () => ({ canViewProjects: true }),
  resolveResourcesCapabilities: () => ({ canViewResources: true }),
}));
vi.mock("@/lib/google/client", () => ({ isDriveConfigured: isDriveConfiguredMock }));
vi.mock("@/lib/google/oauth", () => ({ isOauthConfigured: isOauthConfiguredMock }));
vi.mock("@/lib/repositories/google-oauth-repository", () => ({ getGoogleOauthAccount: getGoogleOauthAccountMock }));
vi.mock("@/lib/google/drive-repository", () => ({ getFileContent: getFileContentMock }));

import { GET } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const caller = (email: string) => ({ member: { id: "staff-1" }, email });
const body = () => new Response("bytes").body as ReadableStream<Uint8Array>;
const call = () => GET(new Request("http://x") as never, ctx("f1"));

beforeEach(() => {
  vi.resetAllMocks();
  isDriveConfiguredMock.mockReturnValue(true);
  isOauthConfiguredMock.mockReturnValue(false);
  getGoogleOauthAccountMock.mockResolvedValue(null);
  requireCapabilityUserMock.mockResolvedValue(caller("ana@cincel.mx"));
});

describe("GET /api/google/drive/file/[id]/content", () => {
  it("401 without a session", async () => {
    requireCapabilityUserMock.mockRejectedValue(new Error("FORBIDDEN"));
    expect((await call()).status).toBe(401);
  });

  it("503 when neither the service account nor OAuth is configured", async () => {
    isDriveConfiguredMock.mockReturnValue(false);
    expect((await call()).status).toBe(503);
  });

  it("403 with no institutional email and no connected account", async () => {
    requireCapabilityUserMock.mockResolvedValue(caller(""));
    expect((await call()).status).toBe(403);
    expect(getFileContentMock).not.toHaveBeenCalled();
  });

  it("fetches as the caller's staffId + email", async () => {
    getFileContentMock.mockResolvedValue({ name: "a.pdf", mimeType: "application/pdf", body: body() });
    await call();
    expect(getFileContentMock).toHaveBeenCalledWith({ staffId: "staff-1", email: "ana@cincel.mx" }, "f1");
  });

  it("renders a PDF inline with nosniff", async () => {
    getFileContentMock.mockResolvedValue({ name: "plano.pdf", mimeType: "application/pdf", body: body() });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline;/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("forces a download for types that aren't safe to render on our origin", async () => {
    for (const mimeType of ["text/html", "image/svg+xml", "application/zip"]) {
      getFileContentMock.mockResolvedValue({ name: "x", mimeType, body: body() });
      const res = await call();
      expect(res.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    }
  });

  it("415 for a folder and 413 for an oversized file", async () => {
    getFileContentMock.mockRejectedValueOnce(new Error("DRIVE_IS_FOLDER"));
    expect((await call()).status).toBe(415);
    getFileContentMock.mockRejectedValueOnce(new Error("DRIVE_TOO_LARGE"));
    expect((await call()).status).toBe(413);
  });

  it("404 when Drive says the file isn't there", async () => {
    getFileContentMock.mockRejectedValue(new Error("DRIVE_API_404: nope"));
    expect((await call()).status).toBe(404);
  });
});
