import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  isDriveConfiguredMock,
  isOauthConfiguredMock,
  getGoogleOauthAccountMock,
  getStaffAccessTokenMock,
  staffOauthConfigMock,
} = vi.hoisted(() => ({
  isDriveConfiguredMock: vi.fn(),
  isOauthConfiguredMock: vi.fn(),
  getGoogleOauthAccountMock: vi.fn(),
  getStaffAccessTokenMock: vi.fn(),
  staffOauthConfigMock: vi.fn(),
}));

vi.mock("@/lib/google/client", () => ({ isDriveConfigured: isDriveConfiguredMock }));
vi.mock("@/lib/google/oauth", () => ({ isOauthConfigured: isOauthConfiguredMock }));
vi.mock("@/lib/repositories/google-oauth-repository", () => ({ getGoogleOauthAccount: getGoogleOauthAccountMock }));
vi.mock("@/lib/google/staff-token", () => ({ getStaffAccessToken: getStaffAccessTokenMock }));
vi.mock("@/lib/google/staff-oauth", () => ({ staffOauthConfig: staffOauthConfigMock }));

import { getPickerDriveStatus, isPickerDriveConfigured, pickerDriveMode, resolvePickerDriveCaller } from "./picker-drive";

const OAUTH_CONFIG = { clientId: "id", clientSecret: "secret", redirectUri: "https://x/cb", workspaceDomain: "cincel.mx" };

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const m of [
    isDriveConfiguredMock,
    isOauthConfiguredMock,
    getGoogleOauthAccountMock,
    getStaffAccessTokenMock,
    staffOauthConfigMock,
  ]) {
    m.mockReset();
  }
  isDriveConfiguredMock.mockReturnValue(true);
  isOauthConfiguredMock.mockReturnValue(false);
  getGoogleOauthAccountMock.mockResolvedValue(null);
  staffOauthConfigMock.mockReturnValue(OAUTH_CONFIG);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pickerDriveMode", () => {
  it("is delegation when AUTH_GOOGLE_ENABLED is unset or false", () => {
    expect(pickerDriveMode()).toBe("delegation");
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "false");
    expect(pickerDriveMode()).toBe("delegation");
  });

  it("is staff_token when AUTH_GOOGLE_ENABLED is true", () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
    expect(pickerDriveMode()).toBe("staff_token");
  });
});

describe("isPickerDriveConfigured", () => {
  it("delegation: service account or old OAuth client", () => {
    isDriveConfiguredMock.mockReturnValue(false);
    expect(isPickerDriveConfigured("delegation")).toBe(false);
    isOauthConfiguredMock.mockReturnValue(true);
    expect(isPickerDriveConfigured("delegation")).toBe(true);
  });

  it("staff_token: the staff OAuth client config", () => {
    expect(isPickerDriveConfigured("staff_token")).toBe(true);
    staffOauthConfigMock.mockReturnValue(null);
    expect(isPickerDriveConfigured("staff_token")).toBe(false);
  });
});

describe("resolvePickerDriveCaller — delegation (flag off, unchanged)", () => {
  it("uses the institutional email and never reads the staff token", async () => {
    const result = await resolvePickerDriveCaller("staff-1", "ana@cincel.mx");
    expect(result).toEqual({ ok: true, caller: { staffId: "staff-1", email: "ana@cincel.mx" } });
    expect(getStaffAccessTokenMock).not.toHaveBeenCalled();
  });

  it("allows a connected legacy account without an institutional email", async () => {
    getGoogleOauthAccountMock.mockResolvedValue({ email: "personal@gmail.com" });
    const result = await resolvePickerDriveCaller("staff-1", "");
    expect(result).toEqual({ ok: true, caller: { staffId: "staff-1", email: "" } });
  });

  it("403 with no email and no connected account", async () => {
    const result = await resolvePickerDriveCaller("staff-1", "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("503 when nothing is configured", async () => {
    isDriveConfiguredMock.mockReturnValue(false);
    const result = await resolvePickerDriveCaller("staff-1", "ana@cincel.mx");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
});

describe("resolvePickerDriveCaller — staff_token (flag on)", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
  });

  it("passes the staff member's own Drive token", async () => {
    getStaffAccessTokenMock.mockResolvedValue({ status: "ok", accessToken: "staff-at" });
    const result = await resolvePickerDriveCaller("staff-1", "ana@cincel.mx");
    expect(getStaffAccessTokenMock).toHaveBeenCalledWith("staff-1", "drive");
    expect(result).toEqual({ ok: true, caller: { staffId: "staff-1", email: "ana@cincel.mx", accessToken: "staff-at" } });
    expect(getGoogleOauthAccountMock).not.toHaveBeenCalled();
  });

  it("403 { error: needs_consent } without a Drive grant", async () => {
    getStaffAccessTokenMock.mockResolvedValue({ status: "needs_consent" });
    const result = await resolvePickerDriveCaller("staff-1", "ana@cincel.mx");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({ error: "needs_consent" });
    }
  });

  it("does not fall back to delegation even when the service account is configured", async () => {
    getStaffAccessTokenMock.mockResolvedValue({ status: "needs_consent" });
    getGoogleOauthAccountMock.mockResolvedValue({ email: "legacy@gmail.com" });
    const result = await resolvePickerDriveCaller("staff-1", "ana@cincel.mx");
    expect(result.ok).toBe(false);
  });

  it("503 when the staff OAuth client isn't configured", async () => {
    staffOauthConfigMock.mockReturnValue(null);
    const result = await resolvePickerDriveCaller("staff-1", "ana@cincel.mx");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
    expect(getStaffAccessTokenMock).not.toHaveBeenCalled();
  });
});

describe("getPickerDriveStatus", () => {
  const user = { staffId: "staff-1", email: "ana@cincel.mx", googleLinked: false };

  it("delegation: spec fields plus the old connect-flow fields", async () => {
    isOauthConfiguredMock.mockReturnValue(true);
    getGoogleOauthAccountMock.mockResolvedValue({ email: "ana.personal@gmail.com" });
    expect(await getPickerDriveStatus(user)).toEqual({
      configured: true,
      mode: "delegation",
      hasDriveGrant: true,
      googleLinked: false,
      oauthAvailable: true,
      connectedEmail: "ana.personal@gmail.com",
    });
    expect(getStaffAccessTokenMock).not.toHaveBeenCalled();
  });

  it("delegation: not configured", async () => {
    isDriveConfiguredMock.mockReturnValue(false);
    expect(await getPickerDriveStatus(user)).toMatchObject({ configured: false, hasDriveGrant: false });
  });

  it("staff_token with a Drive grant", async () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
    getStaffAccessTokenMock.mockResolvedValue({ status: "ok", accessToken: "staff-at" });
    expect(await getPickerDriveStatus({ ...user, googleLinked: true })).toEqual({
      configured: true,
      mode: "staff_token",
      hasDriveGrant: true,
      googleLinked: true,
      oauthAvailable: false,
      connectedEmail: null,
    });
  });

  it("staff_token without a Drive grant", async () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
    getStaffAccessTokenMock.mockResolvedValue({ status: "needs_consent" });
    expect(await getPickerDriveStatus(user)).toMatchObject({ mode: "staff_token", hasDriveGrant: false });
  });

  it("staff_token: a token lookup failure reads as no grant", async () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
    getStaffAccessTokenMock.mockRejectedValue(new Error("network"));
    expect(await getPickerDriveStatus(user)).toMatchObject({ hasDriveGrant: false });
  });
});
