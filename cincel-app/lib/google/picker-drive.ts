import "server-only";

import { NextResponse } from "next/server";

import { isGoogleAuthEnabled } from "@/lib/auth/auth-flags";
import type { DriveCaller } from "@/lib/google/drive-repository";
import { staffOauthConfig } from "@/lib/google/staff-oauth";
import { getStaffAccessToken } from "@/lib/google/staff-token";

/**
 * Drive client for the Recursos picker routes (`app/api/google/drive/*`,
 * backend spec §A.6.3): always the staff member's own Google token with
 * `drive.readonly`. Without it the routes answer 403 `{ error: "needs_consent" }`.
 * The domain-wide delegation client was removed in the cleanup release (§A.8 step 5).
 */

export type PickerDriveMode = "staff_token";

export function pickerDriveMode(): PickerDriveMode {
  return "staff_token";
}

/**
 * Whether the picker can work at all: Google sign-in is on (consent goes through
 * /api/auth/google/start) and the staff OAuth client is configured. Off, the
 * routes answer 503 and Recursos falls back to manual URL entry.
 */
export function isPickerDriveConfigured(): boolean {
  return isGoogleAuthEnabled() && staffOauthConfig() !== null;
}

// A Shared Drive's id is also the id of its root folder, so it works as the start folder.
export function getDriveRootFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() || process.env.GOOGLE_SHARED_DRIVE_ID?.trim() || null;
}

export type PickerDriveCallerResult = { ok: true; caller: DriveCaller } | { ok: false; response: NextResponse };

/**
 * The DriveCaller for a signed-in staff member, or the error response the
 * route returns as is (503 not configured, 403 `needs_consent` without a grant).
 */
export async function resolvePickerDriveCaller(staffId: string, email: string): Promise<PickerDriveCallerResult> {
  if (!isPickerDriveConfigured()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Google Drive is not configured on this server." }, { status: 503 }),
    };
  }

  const token = await getStaffAccessToken(staffId, "drive");
  if (token.status !== "ok") {
    return { ok: false, response: NextResponse.json({ error: "needs_consent" }, { status: 403 }) };
  }
  return { ok: true, caller: { staffId, email, accessToken: token.accessToken } };
}

export type PickerDriveStatus = {
  configured: boolean;
  mode: PickerDriveMode;
  hasDriveGrant: boolean;
  googleLinked: boolean;
  /** Old connect flow; always false now that it is gone. Kept until the picker stops reading it. */
  oauthAvailable: false;
  /** Account connected through the old flow; always null. Kept until the picker stops reading it. */
  connectedEmail: null;
};

/**
 * Body of `GET /api/google/drive/status`. `mode` is always `"staff_token"` and
 * `hasDriveGrant` is the staff member's own `drive.readonly` grant.
 */
export async function getPickerDriveStatus(user: {
  staffId: string;
  email: string;
  googleLinked: boolean;
}): Promise<PickerDriveStatus> {
  const configured = isPickerDriveConfigured();
  let hasDriveGrant = false;
  if (configured) {
    try {
      hasDriveGrant = (await getStaffAccessToken(user.staffId, "drive")).status === "ok";
    } catch {
      hasDriveGrant = false;
    }
  }
  return {
    configured,
    mode: "staff_token",
    hasDriveGrant,
    googleLinked: user.googleLinked,
    oauthAvailable: false,
    connectedEmail: null,
  };
}
