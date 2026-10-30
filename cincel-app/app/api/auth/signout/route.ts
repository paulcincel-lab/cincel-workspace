import { NextResponse, type NextRequest } from "next/server";

import { LOGIN_ROUTE } from "@/lib/auth/public-routes";
import { getAppOrigin, safeReturnTo } from "@/lib/auth/safe-return-to";
import { destroySession } from "@/lib/auth/session";

/**
 * GET /api/auth/signout?next=<path> (backend spec §A.5.1). Deletes the staff
 * session row (if any) and the cookie, then 302s to `safeReturnTo(next,
 * "/login")`. The nested target arrives URL-encoded
 * (`next=%2Flogin%2Fdenegado%3Fmotivo%3Drevoked`).
 *
 * Cross-site GETs are accepted (review NB 4): the server helpers and
 * `AppRouteGuard` send the browser here in redirect chains that may start on
 * another site, so a `Sec-Fetch-Site` check would break them, and the worst a
 * cross-site request can do is sign the user out.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const target = safeReturnTo(request.nextUrl.searchParams.get("next"), LOGIN_ROUTE);

  await destroySession();

  // Built from APP_ORIGIN, never the request host. Without it (password-only
  // installs), a relative Location keeps the browser on the same origin.
  const origin = getAppOrigin();
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: origin ? `${origin}${target}` : target,
      "Cache-Control": "no-store",
    },
  });
}
