import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { requireCapabilityUser } from "@/lib/auth/session";
import { exchangeCodeForAccount } from "@/lib/google/oauth";
import { upsertGoogleOauthAccount } from "@/lib/repositories/google-oauth-repository";
import { OAUTH_STATE_COOKIE, OAUTH_RETURN_TO_COOKIE } from "@/app/api/google/oauth/start/route";

/**
 * GET /api/google/oauth/callback — Google redirects here after the account
 * chooser + consent screen. Verifies the CSRF state cookie, exchanges the
 * code for tokens, stores the connected account, then redirects back to
 * wherever the flow started (`?google_connected=1|error`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const jar = await cookies();
  const expectedState = jar.get(OAUTH_STATE_COOKIE)?.value;
  const returnTo = jar.get(OAUTH_RETURN_TO_COOKIE)?.value || "/recursos";
  jar.delete(OAUTH_STATE_COOKIE);
  jar.delete(OAUTH_RETURN_TO_COOKIE);

  const fail = (reason: string) => NextResponse.redirect(new URL(`${returnTo}?google_connected=error&reason=${reason}`, request.nextUrl.origin));

  let caller;
  try {
    caller = await requireCapabilityUser();
  } catch {
    return fail("unauthorized");
  }

  const params = request.nextUrl.searchParams;
  if (params.get("error")) {
    return fail("denied");
  }

  const state = params.get("state");
  if (!state || !expectedState || state !== expectedState) {
    return fail("state_mismatch");
  }

  const code = params.get("code");
  if (!code) {
    return fail("missing_code");
  }

  try {
    const redirectUri = new URL("/api/google/oauth/callback", request.nextUrl.origin).toString();
    const account = await exchangeCodeForAccount(redirectUri, code);
    if (!account) return fail("exchange_failed");

    await upsertGoogleOauthAccount(caller.member.id, account);
    return NextResponse.redirect(new URL(`${returnTo}?google_connected=1`, request.nextUrl.origin));
  } catch {
    return fail("exchange_failed");
  }
}
