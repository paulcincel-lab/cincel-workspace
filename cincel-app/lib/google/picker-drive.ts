import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { isGoogleAuthEnabled } from "@/lib/auth/auth-flags";
import { db } from "@/lib/db/client";
import { googleOauthAccounts } from "@/lib/db/schema";
import type { DriveCaller } from "@/lib/google/drive-repository";
import { hasGrantedScope, staffOauthConfig } from "@/lib/google/staff-oauth";
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

/**
 * The Drive status for a page render (Ajustes › Integraciones): **DB only**.
 * It reads the staff token row and never refreshes a token, so no OAuth HTTP
 * call and no DB write happen during render. `hasDriveGrant` is true when the
 * row holds the `drive.readonly` grant and either an unexpired access token
 * or a refresh token (the picker routes refresh it when they run).
 */
export async function getPickerDriveGrant(staffId: string): Promise<Pick<PickerDriveStatus, "configured" | "hasDriveGrant">> {
  const configured = isPickerDriveConfigured();
  if (!configured) return { configured, hasDriveGrant: false };
  const [row] = await db
    .select({
      accessToken: googleOauthAccounts.accessToken,
      refreshToken: googleOauthAccounts.refreshToken,
      scope: googleOauthAccounts.scope,
      expiresAt: googleOauthAccounts.expiresAt,
    })
    .from(googleOauthAccounts)
    .where(and(eq(googleOauthAccounts.staffId, staffId), isNotNull(googleOauthAccounts.googleSub)))
    .limit(1);
  if (!row || !row.accessToken || !hasGrantedScope(row.scope, "drive")) return { configured, hasDriveGrant: false };
  const usable = row.expiresAt.getTime() > Date.now() || Boolean(row.refreshToken);
  return { configured, hasDriveGrant: usable };
}
