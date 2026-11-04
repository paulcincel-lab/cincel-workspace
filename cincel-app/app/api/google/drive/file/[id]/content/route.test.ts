import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireCapabilityUserMock, getFileContentMock, getStaffAccessTokenMock, staffOauthConfigMock } = vi.hoisted(
  () => ({
    requireCapabilityUserMock: vi.fn(),
    getFileContentMock: vi.fn(),
    getStaffAccessTokenMock: vi.fn(),
    staffOauthConfigMock: vi.fn(),
  })
);

vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: requireCapabilityUserMock }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveProjectsCapabilities: () => ({ canViewProjects: true }),
  resolveResourcesCapabilities: () => ({ canViewResources: true }),
}));
vi.mock("@/lib/google/drive-repository", () => ({ getFileContent: getFileContentMock }));
vi.mock("@/lib/google/staff-token", () => ({ getStaffAccessToken: getStaffAccessTokenMock }));
vi.mock("@/lib/google/staff-oauth", () => ({ staffOauthConfig: staffOauthConfigMock }));

import { GET } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const caller = (email: string) => ({ member: { id: "staff-1" }, email });
const body = () => new Response("bytes").body as ReadableStream<Uint8Array>;
const call = () => GET(new Request("http://x") as never, ctx("f1"));

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
  requireCapabilityUserMock.mockResolvedValue(caller("ana@cincel.mx"));
  staffOauthConfigMock.mockReturnValue({ clientId: "id", clientSecret: "s", redirectUri: "r", workspaceDomain: "cincel.mx" });
  getStaffAccessTokenMock.mockResolvedValue({ status: "ok", accessToken: "staff-at" });
});

describe("GET /api/google/drive/file/[id]/content", () => {
  it("401 without a session", async () => {
    requireCapabilityUserMock.mockRejectedValue(new Error("FORBIDDEN"));
    expect((await call()).status).toBe(401);
  });

  it("503 when the staff OAuth client isn't configured", async () => {
    staffOauthConfigMock.mockReturnValue(null);
    expect((await call()).status).toBe(503);
  });

  it("fetches the bytes with the staff member's own token", async () => {
    getFileContentMock.mockResolvedValue({ name: "a.pdf", mimeType: "application/pdf", body: body() });
    expect((await call()).status).toBe(200);
    expect(getStaffAccessTokenMock).toHaveBeenCalledWith("staff-1", "drive");
    expect(getFileContentMock).toHaveBeenCalledWith(
      { staffId: "staff-1", email: "ana@cincel.mx", accessToken: "staff-at" },
      "f1"
    );
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

  it("403 { error: needs_consent } without a Drive grant", async () => {
    getStaffAccessTokenMock.mockResolvedValue({ status: "needs_consent" });
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "needs_consent" });
    expect(getFileContentMock).not.toHaveBeenCalled();
  });
});
