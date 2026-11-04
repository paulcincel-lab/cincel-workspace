import "server-only";

import { NextResponse } from "next/server";

import { isGoogleAuthEnabled } from "@/lib/auth/auth-flags";
import { isDriveConfigured } from "@/lib/google/client";
import type { DriveCaller } from "@/lib/google/drive-repository";
import { isOauthConfigured } from "@/lib/google/oauth";
import { staffOauthConfig } from "@/lib/google/staff-oauth";
import { getStaffAccessToken } from "@/lib/google/staff-token";
import { getGoogleOauthAccount } from "@/lib/repositories/google-oauth-repository";

/**
 * Drive client choice for the Recursos picker routes (`app/api/google/drive/*`,
 * backend spec §A.6.3):
 *   - AUTH_GOOGLE_ENABLED=false → "delegation": the old connect flow first, then
 *     service-account impersonation of the institutional email. Unchanged.
 *   - AUTH_GOOGLE_ENABLED=true  → "staff_token": the staff member's own Google
 *     token with `drive.readonly`. Without it the routes answer 403
 *     `{ error: "needs_consent" }`.
 */

export type PickerDriveMode = "delegation" | "staff_token";

export function pickerDriveMode(): PickerDriveMode {
  return isGoogleAuthEnabled() ? "staff_token" : "delegation";
}

/** Whether the picker can work at all in the current mode. */
export function isPickerDriveConfigured(mode: PickerDriveMode = pickerDriveMode()): boolean {
  if (mode === "staff_token") return staffOauthConfig() !== null;
  return isDriveConfigured() || isOauthConfigured();
}

export type PickerDriveCallerResult = { ok: true; caller: DriveCaller } | { ok: false; response: NextResponse };

/**
 * The DriveCaller for a signed-in staff member, or the error response the
 * route returns as is (503 not configured, 403 no usable identity / grant).
 */
export async function resolvePickerDriveCaller(staffId: string, email: string): Promise<PickerDriveCallerResult> {
  const mode = pickerDriveMode();

  if (!isPickerDriveConfigured(mode)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Google Drive is not configured on this server." }, { status: 503 }),
    };
  }

  if (mode === "staff_token") {
    const token = await getStaffAccessToken(staffId, "drive");
    if (token.status !== "ok") {
      return { ok: false, response: NextResponse.json({ error: "needs_consent" }, { status: 403 }) };
    }
    return { ok: true, caller: { staffId, email, accessToken: token.accessToken } };
  }

  const oauthAccount = await getGoogleOauthAccount(staffId);
  if (!oauthAccount && !email) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Conecta tu cuenta de Google o configura un correo institucional." },
        { status: 403 }
      ),
    };
  }
  return { ok: true, caller: { staffId, email } };
}

export type PickerDriveStatus = {
  configured: boolean;
  mode: PickerDriveMode;
  hasDriveGrant: boolean;
  googleLinked: boolean;
  /** Old connect flow (delegation mode only; false in staff_token mode). */
  oauthAvailable: boolean;
  /** Account connected through the old flow (delegation mode only). */
  connectedEmail: string | null;
};

/**
 * Body of `GET /api/google/drive/status`. `hasDriveGrant` is the staff
 * member's own `drive.readonly` grant in staff_token mode, and a connected
 * legacy account or an institutional email in delegation mode. The old
 * `oauthAvailable` / `connectedEmail` fields stay so the picker works as
 * before while the flag is off.
 */
export async function getPickerDriveStatus(user: {
  staffId: string;
  email: string;
  googleLinked: boolean;
}): Promise<PickerDriveStatus> {
  const mode = pickerDriveMode();
  const configured = isPickerDriveConfigured(mode);

  if (mode === "staff_token") {
    let hasDriveGrant = false;
    if (configured) {
      try {
        hasDriveGrant = (await getStaffAccessToken(user.staffId, "drive")).status === "ok";
      } catch {
        hasDriveGrant = false;
      }
    }
    return { configured, mode, hasDriveGrant, googleLinked: user.googleLinked, oauthAvailable: false, connectedEmail: null };
  }

  const oauthAvailable = isOauthConfigured();
  const account = oauthAvailable ? await getGoogleOauthAccount(user.staffId) : null;
  const hasDriveGrant = account !== null || (isDriveConfigured() && user.email !== "");
  return {
    configured,
    mode,
    hasDriveGrant,
    googleLinked: user.googleLinked,
    oauthAvailable,
    connectedEmail: account?.email ?? null,
  };
}
