import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireSessionAccessMock,
  isDriveConfiguredMock,
  isOauthConfiguredMock,
  getGoogleOauthAccountMock,
  getStaffAccessTokenMock,
  staffOauthConfigMock,
} = vi.hoisted(() => ({
  requireSessionAccessMock: vi.fn(),
  isDriveConfiguredMock: vi.fn(),
  isOauthConfiguredMock: vi.fn(),
  getGoogleOauthAccountMock: vi.fn(),
  getStaffAccessTokenMock: vi.fn(),
  staffOauthConfigMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireSessionAccess: requireSessionAccessMock }));
vi.mock("@/lib/google/client", () => ({ isDriveConfigured: isDriveConfiguredMock }));
vi.mock("@/lib/google/oauth", () => ({ isOauthConfigured: isOauthConfiguredMock }));
vi.mock("@/lib/repositories/google-oauth-repository", () => ({ getGoogleOauthAccount: getGoogleOauthAccountMock }));
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
  isDriveConfiguredMock.mockReturnValue(true);
  isOauthConfiguredMock.mockReturnValue(false);
  getGoogleOauthAccountMock.mockResolvedValue(null);
  staffOauthConfigMock.mockReturnValue({ clientId: "id", clientSecret: "s", redirectUri: "r", workspaceDomain: "cincel.mx" });
  requireSessionAccessMock.mockResolvedValue(user());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/google/drive/status", () => {
  it("401 without a session", async () => {
    requireSessionAccessMock.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ configured: false, hasDriveGrant: false });
  });

  it("flag off: delegation mode with the old connect-flow fields", async () => {
    isOauthConfiguredMock.mockReturnValue(true);
    getGoogleOauthAccountMock.mockResolvedValue({ email: "ana.personal@gmail.com" });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: true,
      mode: "delegation",
      hasDriveGrant: true,
      googleLinked: false,
      oauthAvailable: true,
      connectedEmail: "ana.personal@gmail.com",
    });
    expect(getStaffAccessTokenMock).not.toHaveBeenCalled();
  });

  it("flag on: staff_token mode without a Drive grant", async () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
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

  it("flag on: staff_token mode with a Drive grant", async () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
    getStaffAccessTokenMock.mockResolvedValue({ status: "ok", accessToken: "staff-at" });

    expect(await (await GET()).json()).toMatchObject({ mode: "staff_token", hasDriveGrant: true, googleLinked: false });
  });
});
