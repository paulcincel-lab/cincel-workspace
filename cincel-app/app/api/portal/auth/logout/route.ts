import { NextResponse, type NextRequest } from "next/server";

import { PORTAL_LOGIN_ROUTE } from "@/lib/auth/public-routes";
import { getAppOrigin, safeReturnTo } from "@/lib/auth/safe-return-to";
import { destroyPortalSession } from "@/lib/portal/session";

/**
 * POST /api/portal/auth/logout (BE §B.4.2): deletes the portal session row
 * and clears the `cincel_portal_session` cookie → 204. Never touches the
 * staff session.
 */
export async function POST(): Promise<NextResponse> {
  await destroyPortalSession();
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/**
 * GET /api/portal/auth/logout?next=<path>: the same, then a 302 to
 * `safeReturnTo(next, "/portal/login")` on APP_ORIGIN. Portal pages use it to
 * drop a stale cookie, since Server Components can't.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const target = safeReturnTo(request.nextUrl.searchParams.get("next"), PORTAL_LOGIN_ROUTE);

  await destroyPortalSession();

  const origin = getAppOrigin();
  return new NextResponse(null, {
    status: 302,
    headers: { Location: origin ? `${origin}${target}` : target, "Cache-Control": "no-store" },
  });
}
