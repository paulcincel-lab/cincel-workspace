import { randomBytes } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { requireCapabilityUser } from "@/lib/auth/session";
import { CALENDAR_SCOPE, buildAuthUrl } from "@/lib/google/oauth";

export const OAUTH_STATE_COOKIE = "google_oauth_state";
export const OAUTH_RETURN_TO_COOKIE = "google_oauth_return_to";

/**
 * GET /api/google/oauth/start?return_to=/recursos — kicks off "Sign in with
 * Google": redirects to Google's own account chooser so the caller picks
 * (or re-picks) which Google account this connects. `state` is a CSRF token
 * verified on the way back in the callback route.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireCapabilityUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redirectUri = new URL("/api/google/oauth/callback", request.nextUrl.origin).toString();
  const state = randomBytes(24).toString("hex");
  // `?scope=calendar` adds Google Calendar access on top of Drive (#434).
  const extraScopes = request.nextUrl.searchParams.get("scope") === "calendar" ? [CALENDAR_SCOPE] : [];
  const authUrl = buildAuthUrl(redirectUri, state, { extraScopes });
  if (!authUrl) {
    return NextResponse.json({ error: "Google OAuth is not configured on this server." }, { status: 503 });
  }

  const returnTo = request.nextUrl.searchParams.get("return_to") || "/recursos";
  const jar = await cookies();
  const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  jar.set(OAUTH_STATE_COOKIE, state, cookieOpts);
  jar.set(OAUTH_RETURN_TO_COOKIE, returnTo.startsWith("/") ? returnTo : "/recursos", cookieOpts);

  return NextResponse.redirect(authUrl);
}
