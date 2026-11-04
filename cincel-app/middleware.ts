import { type NextRequest, NextResponse } from "next/server";
import { isPortalPath, isPublicPath, isPublicPortalPath, LOGIN_ROUTE, PORTAL_LOGIN_ROUTE } from "@/lib/auth/public-routes";
import { PORTAL_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/auth/session-cookie";

/**
 * Enforces authentication before any protected page renders.
 *
 * This is a cheap presence check on the session cookie only — full validation
 * (expiry, member still active, role) happens server-side in `getSession()` /
 * `getSessionAccess()` and the client-side `AppRouteGuard` (which uses the
 * server-resolved decision hydrated by the root layout).
 *
 * A request with a cookie is never redirected away from `/login`: the cookie
 * may be stale (expired or deleted session row), and bouncing it to
 * `/dashboard` would loop. Public paths (including `/portal/*`) are outside
 * the staff redirect.
 *
 * `/portal/*` has its own gate on the portal cookie only (backend spec §B.7):
 * without it the request goes to `/portal/login`. `/portal/login` and the
 * magic-link landing page `/portal/acceder` stay public. A staff cookie never
 * counts as a portal session. As with staff, a stale portal cookie passes here
 * and `requirePortalUser()` clears it server-side.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (isPortalPath(pathname)) {
    const hasPortalSession = Boolean(request.cookies.get(PORTAL_SESSION_COOKIE)?.value);
    if (!hasPortalSession && !isPublicPortalPath(pathname)) {
      const portalLoginUrl = request.nextUrl.clone();
      portalLoginUrl.pathname = PORTAL_LOGIN_ROUTE;
      portalLoginUrl.search = "";
      return NextResponse.redirect(portalLoginUrl);
    }
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_ROUTE;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
