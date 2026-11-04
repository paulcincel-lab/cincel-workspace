import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireSessionAccessMock, getStaffAccessTokenMock, staffOauthConfigMock } = vi.hoisted(() => ({
  requireSessionAccessMock: vi.fn(),
  getStaffAccessTokenMock: vi.fn(),
  staffOauthConfigMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireSessionAccess: requireSessionAccessMock }));
vi.mock("@/lib/google/staff-token", () => ({ getStaffAccessToken: getStaffAccessTokenMock }));
vi.mock("@/lib/google/staff-oauth", () => ({ staffOauthConfig: staffOauthConfigMock }));

import { GET } from "./route";

const user = (overrides: Partial<{ email: string | null; googleLinked: boolean }> = {}) => ({
  id: "staff-1",
  email: "ana@cincel.mx",
  googleLinked: false,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  staffOauthConfigMock.mockReturnValue({ clientId: "id", clientSecret: "s", redirectUri: "r", workspaceDomain: "cincel.mx" });
  requireSessionAccessMock.mockResolvedValue(user());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/google/drive/status", () => {
  it("401 without a session, still in staff_token mode", async () => {
    requireSessionAccessMock.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ configured: false, mode: "staff_token", hasDriveGrant: false });
  });

  it("staff_token mode without a Drive grant", async () => {
    requireSessionAccessMock.mockResolvedValue(user({ googleLinked: true }));
    getStaffAccessTokenMock.mockResolvedValue({ status: "needs_consent" });

    const body = await (await GET()).json();

    expect(body).toEqual({
      configured: true,
      mode: "staff_token",
      hasDriveGrant: false,
      googleLinked: true,
      oauthAvailable: false,
      connectedEmail: null,
    });
    expect(getStaffAccessTokenMock).toHaveBeenCalledWith("staff-1", "drive");
  });

  it("staff_token mode with a Drive grant", async () => {
    getStaffAccessTokenMock.mockResolvedValue({ status: "ok", accessToken: "staff-at" });

    expect(await (await GET()).json()).toMatchObject({ mode: "staff_token", hasDriveGrant: true, googleLinked: false });
  });

  it("reports staff_token even with AUTH_GOOGLE_ENABLED=false", async () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "false");
    getStaffAccessTokenMock.mockResolvedValue({ status: "ok", accessToken: "staff-at" });

    expect(await (await GET()).json()).toMatchObject({ mode: "staff_token", hasDriveGrant: true });
  });
});
