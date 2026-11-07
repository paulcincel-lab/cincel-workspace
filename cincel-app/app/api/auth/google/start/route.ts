import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { isGoogleAuthEnabled } from "@/lib/auth/auth-flags";
import { clientIp, googleStartRateLimiter } from "@/lib/auth/rate-limit";
import { getAppOrigin } from "@/lib/auth/safe-return-to";
import { getSession } from "@/lib/auth/session";
import { parseStaffOauthScope, startStaffOauth, staffOauthConfig } from "@/lib/google/staff-oauth";

/**
 * GET /api/auth/google/start?return_to= — "Entrar con Google" (backend spec
 * §A.4). Sets the state + PKCE cookie and redirects to Google. Only enabled
 * with AUTH_GOOGLE_ENABLED. Rate limited to 20 per 10 minutes per IP
 * (`X-Real-IP`, §A.10). `return_to` is validated by `safeReturnTo()`.
 *
 * With `?scope=drive|calendar|gmail` (or its alias `?grant=`, redesign BE
 * §11.1) it is the incremental consent of §A.6.2 for a signed-in staff
 * member: `prompt=consent`, `login_hint=<their email>`. Without a session it
 * sends the browser to `/login`.
 */

export async function GET(request: NextRequest): Promise<Response> {
  if (!isGoogleAuthEnabled()) return new NextResponse("Not Found", { status: 404 });

  const limit = googleStartRateLimiter.hit(clientIp(request.headers) ?? "unknown");
  if (!limit.allowed) {
    return new NextResponse("Demasiados intentos. Espera unos minutos e intenta de nuevo.", {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds), "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const origin = getAppOrigin();
  if (!staffOauthConfig() || !origin) {
    console.error("[auth/google/start] El inicio de sesión con Google no está configurado");
    if (!origin) return new NextResponse("Inicio de sesión con Google no configurado", { status: 503 });
    return NextResponse.redirect(new URL("/login?error=retry", origin));
  }

  const params = request.nextUrl.searchParams;
  const returnTo = params.get("return_to");
  // `grant` is an alias of `scope` (redesign BE §11.1, `?grant=gmail`); `scope` wins when both are sent.
  const rawScope = params.get("scope") ?? params.get("grant");
  const scope = rawScope === null ? null : parseStaffOauthScope(rawScope);
  if (rawScope !== null && !scope) return new NextResponse("Permiso de Google no válido", { status: 400 });

  let loginHint: string | null = null;
  if (scope) {
    const session = await getSession();
    if (!session) return NextResponse.redirect(new URL("/login", origin));
    loginHint = session.user.email ?? null;
  }

  const { url, cookie } = startStaffOauth({ returnTo, scope, loginHint });
  const jar = await cookies();
  jar.set(cookie.name, cookie.value, cookie.options);
  return NextResponse.redirect(url);
}
