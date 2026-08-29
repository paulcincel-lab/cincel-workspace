import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { isDriveConfigured } from "@/lib/google/client";

/** GET /api/google/drive/status → { configured } — for hiding the picker button. */
export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ configured: false }, { status: 401 });
  }
  return NextResponse.json({ configured: isDriveConfigured() });
}
