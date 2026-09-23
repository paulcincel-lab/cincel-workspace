import { NextResponse } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { isDriveConfigured } from "@/lib/google/client";
import { isOauthConfigured } from "@/lib/google/oauth";
import { getGoogleOauthAccount } from "@/lib/repositories/google-oauth-repository";

/**
 * GET /api/google/drive/status — for the picker's connect/switch-account UI
 * and for hiding the picker button entirely when nothing is configured.
 */
export async function GET(): Promise<NextResponse> {
  let caller;
  try {
    caller = await requireCapabilityUser();
  } catch {
    return NextResponse.json({ configured: false, oauthAvailable: false, connectedEmail: null }, { status: 401 });
  }

  const account = isOauthConfigured() ? await getGoogleOauthAccount(caller.member.id) : null;

  return NextResponse.json({
    configured: isDriveConfigured() || isOauthConfigured(),
    oauthAvailable: isOauthConfigured(),
    connectedEmail: account?.email ?? null,
  });
}
