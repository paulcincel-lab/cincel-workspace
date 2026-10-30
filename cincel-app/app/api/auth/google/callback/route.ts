import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { isGoogleAuthEnabled } from "@/lib/auth/auth-flags";
import { recordGoogleSignInDenied, signInWithGoogle } from "@/lib/auth/google-sign-in";
import { clientIp } from "@/lib/auth/rate-limit";
import { getAppOrigin } from "@/lib/auth/safe-return-to";
import { createSession } from "@/lib/auth/session";
import {
  clearStaffOauthCookie,
  exchangeStaffCode,
  STAFF_OAUTH_COOKIE,
  verifyStaffOauthState,
} from "@/lib/google/staff-oauth";

/**
 * GET /api/auth/google/callback — Google redirects here after sign-in
 * (backend spec §A.4). Every check runs before `createSession()`, so a
 * refused user never gets a session:
 * - state / PKCE cookie missing, expired or mismatched → `/login?error=state`
 * - Google error, missing code, failed exchange or Directory outage → `/login?error=retry`
 * - ID token outside the domain or unverified, or a gate denial →
 *   `/login/denegado?motivo=<reason>` (with an `auth_events` row)
 * - allowed → session cookie, then the stored `return_to` (default `/dashboard`)
 * The state cookie is cleared on every outcome. Only enabled with AUTH_GOOGLE_ENABLED.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!isGoogleAuthEnabled()) return new NextResponse("Not Found", { status: 404 });

  const origin = getAppOrigin();
  if (!origin) {
    console.error("[auth/google/callback] APP_ORIGIN no está configurado");
    return new NextResponse("Inicio de sesión con Google no configurado", { status: 503 });
  }

  const jar = await cookies();
  const stateCookie = jar.get(STAFF_OAUTH_COOKIE)?.value;
  const cleared = clearStaffOauthCookie();
  jar.set(cleared.name, cleared.value, cleared.options);

  const redirect = (path: string) => NextResponse.redirect(new URL(path, origin));
  const params = request.nextUrl.searchParams;

  const stored = verifyStaffOauthState(stateCookie, params.get("state"));
  // Incremental grants (`scope`) have their own flow; this callback only signs in.
  if (!stored || stored.scope !== null) return redirect("/login?error=state");

  const code = params.get("code");
  if (params.get("error") || !code) return redirect("/login?error=retry");

  const meta = { ip: clientIp(request.headers), userAgent: request.headers.get("user-agent") };

  try {
    const { check, tokens } = await exchangeStaffCode(code, stored.codeVerifier);
    if (!check.ok) {
      console.warn(`[auth/google/callback] ID token rechazado (${check.detail})`);
      await recordGoogleSignInDenied(check.reason, meta);
      return redirect(`/login/denegado?motivo=${check.reason}`);
    }

    const result = await signInWithGoogle(check.identity, tokens, meta);
    if (result.status === "retry") return redirect("/login?error=retry");
    if (result.status === "denied") return redirect(`/login/denegado?motivo=${encodeURIComponent(result.reason)}`);

    await createSession(result.staffId, meta.userAgent);
    return redirect(stored.returnTo);
  } catch (error) {
    console.error(
      "[auth/google/callback] No se pudo completar el inicio de sesión",
      error instanceof Error ? error.name : "",
    );
    return redirect("/login?error=retry");
  }
}
