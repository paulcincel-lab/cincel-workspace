import { NextResponse } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { revokeOauthToken } from "@/lib/google/oauth";
import { deleteGoogleOauthAccount, getGoogleOauthAccount } from "@/lib/repositories/google-oauth-repository";

/** POST /api/google/oauth/disconnect — disconnects the caller's own Google account. */
export async function POST(): Promise<NextResponse> {
  let caller;
  try {
    caller = await requireCapabilityUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getGoogleOauthAccount(caller.member.id);
  if (account) {
    await revokeOauthToken(account.accessToken);
    await deleteGoogleOauthAccount(caller.member.id);
  }

  return NextResponse.json({ ok: true });
}
