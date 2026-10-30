import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { isGoogleAuthEnabled } from "@/lib/auth/auth-flags";
import { clientIp, googleStartRateLimiter } from "@/lib/auth/rate-limit";
import { getAppOrigin } from "@/lib/auth/safe-return-to";
import { startStaffOauth, staffOauthConfig } from "@/lib/google/staff-oauth";

/**
 * GET /api/auth/google/start?return_to= — "Entrar con Google" (backend spec
 * §A.4). Sets the state + PKCE cookie and redirects to Google. Only enabled
 * with AUTH_GOOGLE_ENABLED. Rate limited to 20 per 10 minutes per IP
 * (`X-Real-IP`, §A.10). `return_to` is validated by `safeReturnTo()`.
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

  const { url, cookie } = startStaffOauth({ returnTo: request.nextUrl.searchParams.get("return_to") });
  const jar = await cookies();
  jar.set(cookie.name, cookie.value, cookie.options);
  return NextResponse.redirect(url);
}
