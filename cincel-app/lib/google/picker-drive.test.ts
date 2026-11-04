import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getStaffAccessTokenMock, staffOauthConfigMock } = vi.hoisted(() => ({
  getStaffAccessTokenMock: vi.fn(),
  staffOauthConfigMock: vi.fn(),
}));

vi.mock("@/lib/google/staff-token", () => ({ getStaffAccessToken: getStaffAccessTokenMock }));
vi.mock("@/lib/google/staff-oauth", () => ({ staffOauthConfig: staffOauthConfigMock }));

import {
  getDriveRootFolderId,
  getPickerDriveStatus,
  isPickerDriveConfigured,
  pickerDriveMode,
  resolvePickerDriveCaller,
} from "./picker-drive";

const OAUTH_CONFIG = { clientId: "id", clientSecret: "secret", redirectUri: "https://x/cb", workspaceDomain: "cincel.mx" };

beforeEach(() => {
  vi.unstubAllEnvs();
  getStaffAccessTokenMock.mockReset();
  staffOauthConfigMock.mockReset();
  staffOauthConfigMock.mockReturnValue(OAUTH_CONFIG);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pickerDriveMode", () => {
  it("is always staff_token, whatever AUTH_GOOGLE_ENABLED says", () => {
    expect(pickerDriveMode()).toBe("staff_token");
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "false");
    expect(pickerDriveMode()).toBe("staff_token");
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
    expect(pickerDriveMode()).toBe("staff_token");
  });
});

describe("isPickerDriveConfigured", () => {
  it("follows the staff OAuth client config only", () => {
    expect(isPickerDriveConfigured()).toBe(true);
    staffOauthConfigMock.mockReturnValue(null);
    expect(isPickerDriveConfigured()).toBe(false);
  });

  it("is false with only service-account credentials set", () => {
    vi.stubEnv("GOOGLE_SA_CLIENT_EMAIL", "sa@example.iam.gserviceaccount.com");
    vi.stubEnv("GOOGLE_SA_PRIVATE_KEY", "not-a-real-key");
    staffOauthConfigMock.mockReturnValue(null);
    expect(isPickerDriveConfigured()).toBe(false);
  });
});

describe("getDriveRootFolderId", () => {
  it("prefers GOOGLE_DRIVE_ROOT_FOLDER_ID, then the Shared Drive id, else null", () => {
    vi.stubEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID", "folder-1");
    vi.stubEnv("GOOGLE_SHARED_DRIVE_ID", "shared-1");
    expect(getDriveRootFolderId()).toBe("folder-1");
    vi.stubEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID", "  ");
    expect(getDriveRootFolderId()).toBe("shared-1");
    vi.stubEnv("GOOGLE_SHARED_DRIVE_ID", "");
    expect(getDriveRootFolderId()).toBeNull();
  });
});

describe("resolvePickerDriveCaller", () => {
  it("passes the staff member's own Drive token", async () => {
    getStaffAccessTokenMock.mockResolvedValue({ status: "ok", accessToken: "staff-at" });
    const result = await resolvePickerDriveCaller("staff-1", "ana@cincel.mx");
    expect(getStaffAccessTokenMock).toHaveBeenCalledWith("staff-1", "drive");
    expect(result).toEqual({ ok: true, caller: { staffId: "staff-1", email: "ana@cincel.mx", accessToken: "staff-at" } });
  });

  it("uses the staff token with AUTH_GOOGLE_ENABLED=false too", async () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "false");
    getStaffAccessTokenMock.mockResolvedValue({ status: "ok", accessToken: "staff-at" });
    const result = await resolvePickerDriveCaller("staff-1", "");
    expect(result).toEqual({ ok: true, caller: { staffId: "staff-1", email: "", accessToken: "staff-at" } });
  });

  it("403 { error: needs_consent } without a Drive grant, even with an institutional email", async () => {
    getStaffAccessTokenMock.mockResolvedValue({ status: "needs_consent" });
    const result = await resolvePickerDriveCaller("staff-1", "ana@cincel.mx");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({ error: "needs_consent" });
    }
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

  it("with a Drive grant", async () => {
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

  it("without a Drive grant", async () => {
    getStaffAccessTokenMock.mockResolvedValue({ status: "needs_consent" });
    expect(await getPickerDriveStatus(user)).toMatchObject({ mode: "staff_token", hasDriveGrant: false });
  });

  it("reports staff_token with AUTH_GOOGLE_ENABLED=false", async () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "false");
    getStaffAccessTokenMock.mockResolvedValue({ status: "needs_consent" });
    expect(await getPickerDriveStatus(user)).toMatchObject({ mode: "staff_token", oauthAvailable: false, connectedEmail: null });
  });

  it("not configured: no token lookup", async () => {
    staffOauthConfigMock.mockReturnValue(null);
    expect(await getPickerDriveStatus(user)).toMatchObject({ configured: false, mode: "staff_token", hasDriveGrant: false });
    expect(getStaffAccessTokenMock).not.toHaveBeenCalled();
  });

  it("a token lookup failure reads as no grant", async () => {
    getStaffAccessTokenMock.mockRejectedValue(new Error("network"));
    expect(await getPickerDriveStatus(user)).toMatchObject({ hasDriveGrant: false });
  });
});
