import { NextResponse } from "next/server";

import { requireSessionAccess } from "@/lib/auth/session";
import { getPickerDriveStatus } from "@/lib/google/picker-drive";

/**
 * GET /api/google/drive/status — for the picker's Conectar Google Drive button
 * and for hiding the picker entirely when nothing is configured. Returns
 * `{ configured, mode, hasDriveGrant, googleLinked }` (backend spec §A.6.3);
 * `mode` is always `"staff_token"`. The old `oauthAvailable` / `connectedEmail`
 * fields stay as `false` / `null` until the picker stops reading them.
 */
export async function GET(): Promise<NextResponse> {
  let user;
  try {
    user = await requireSessionAccess();
  } catch {
    return NextResponse.json(
      {
        configured: false,
        mode: "staff_token",
        hasDriveGrant: false,
        googleLinked: false,
        oauthAvailable: false,
        connectedEmail: null,
      },
      { status: 401 }
    );
  }

  return NextResponse.json(
    await getPickerDriveStatus({ staffId: user.id, email: user.email ?? "", googleLinked: user.googleLinked })
  );
}
