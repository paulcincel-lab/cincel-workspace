import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { isGoogleAuthEnabled } from "@/lib/auth/auth-flags";
import { grantGoogleScope } from "@/lib/auth/google-consent";
import { recordGoogleSignInDenied, signInWithGoogle } from "@/lib/auth/google-sign-in";
import { clientIp } from "@/lib/auth/rate-limit";
import { getAppOrigin } from "@/lib/auth/safe-return-to";
import { createSession, getSession } from "@/lib/auth/session";
import {
  clearStaffOauthCookie,
  exchangeStaffCode,
  STAFF_OAUTH_COOKIE,
  type StaffOauthState,
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
 *
 * State with a `scope` is an incremental grant (§A.6.2), handled by `consentCallback`.
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
  if (!stored) return redirect("/login?error=state");

  const meta = { ip: clientIp(request.headers), userAgent: request.headers.get("user-agent") };
  if (stored.scope !== null) return consentCallback(request, stored, origin, meta);

  const code = params.get("code");
  if (params.get("error") || !code) return redirect("/login?error=retry");

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

/** `return_to` (already same-origin, from the state cookie) with the consent result params. */
function consentRedirect(origin: string, returnTo: string, result: { motivo: string } | null): Response {
  const target = new URL(returnTo, origin);
  if (target.origin !== origin) return NextResponse.redirect(new URL("/dashboard", origin));
  target.searchParams.delete("google_connected");
  target.searchParams.delete("motivo");
  target.searchParams.set("google_connected", result ? "error" : "1");
  if (result) target.searchParams.set("motivo", result.motivo);
  return NextResponse.redirect(target);
}

/**
 * Incremental consent (§A.6.2, review NB 6) for the signed-in staff member.
 * Never creates or deletes a session. Every outcome goes back to `return_to`:
 * `?google_connected=1` on success, `?google_connected=error&motivo=<reason>`
 * otherwise (`retry`, `scope_missing`, or a denial reason such as
 * `sub_mismatch` or `no_role_group`); a denial stores no tokens.
 */
async function consentCallback(
  request: NextRequest,
  stored: StaffOauthState,
  origin: string,
  meta: { ip: string | null; userAgent: string | null },
): Promise<Response> {
  const scope = stored.scope;
  const session = await getSession();
  if (!session || !scope) return NextResponse.redirect(new URL("/login", origin));
  const fail = (motivo: string) => consentRedirect(origin, stored.returnTo, { motivo });
  if (session.staffAccess.accessRevokedAt) return fail("revoked");

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (params.get("error") || !code) return fail("retry");

  try {
    const { check, tokens } = await exchangeStaffCode(code, stored.codeVerifier);
    if (!check.ok) {
      console.warn(`[auth/google/callback] ID token rechazado en el consentimiento (${check.detail})`);
      return fail(check.reason);
    }
    const result = await grantGoogleScope(session.user.id, scope, check.identity, tokens, meta);
    if (result.status === "granted") return consentRedirect(origin, stored.returnTo, null);
    if (result.status === "denied") return fail(result.reason);
    return fail(result.status);
  } catch (error) {
    console.error(
      "[auth/google/callback] No se pudo completar el consentimiento",
      error instanceof Error ? error.name : "",
    );
    return fail("retry");
  }
}
