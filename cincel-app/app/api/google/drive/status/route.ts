import { NextResponse } from "next/server";

import { requireSessionAccess } from "@/lib/auth/session";
import { getPickerDriveStatus, pickerDriveMode } from "@/lib/google/picker-drive";

/**
 * GET /api/google/drive/status — for the picker's connect/switch-account UI
 * and for hiding the picker button entirely when nothing is configured.
 * Returns `{ configured, mode, hasDriveGrant, googleLinked }` (backend spec
 * §A.6.3) plus the old `oauthAvailable` / `connectedEmail` fields. The picker
 * shows **Conectar Google Drive** when `mode = "staff_token"` and
 * `hasDriveGrant` is false.
 */
export async function GET(): Promise<NextResponse> {
  let user;
  try {
    user = await requireSessionAccess();
  } catch {
    return NextResponse.json(
      {
        configured: false,
        mode: pickerDriveMode(),
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
