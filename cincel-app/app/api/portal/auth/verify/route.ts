import { after, NextResponse, type NextRequest } from "next/server";

import { clientIp } from "@/lib/auth/rate-limit";
import { getAppOrigin } from "@/lib/auth/safe-return-to";
import {
  PORTAL_LINK_ERROR_PATH,
  PORTAL_LINK_INVALID_MESSAGE,
  PORTAL_RATE_LIMITED_MESSAGE,
  parsePortalLinkToken,
  portalSignInTarget,
  portalVerifyIpRateLimiter,
} from "@/lib/portal/auth-flow";
import { cleanupPortalLoginRows, consumePortalLoginLink, recordPortalSignIn } from "@/lib/portal/login-links";
import { createPortalSession } from "@/lib/portal/session";

const NO_STORE = { "Cache-Control": "no-store" };

type Body = { token: unknown; json: boolean };

/** Reads `{ token }` from JSON (fetch) or a form post (the "Entrar al portal" button). */
async function readBody(request: NextRequest): Promise<Body> {
  const json = (request.headers.get("content-type") ?? "").includes("application/json");
  try {
    if (json) {
      const body = (await request.json()) as { token?: unknown } | null;
      return { token: body?.token, json };
    }
    const form = await request.formData();
    return { token: form.get("token"), json };
  } catch {
    return { token: null, json };
  }
}

/** 303 to `path` on APP_ORIGIN (never the request host); relative when it isn't set. */
function seeOther(path: string): NextResponse {
  const origin = getAppOrigin();
  return new NextResponse(null, { status: 303, headers: { ...NO_STORE, Location: origin ? `${origin}${path}` : path } });
}

function invalidLink(json: boolean): NextResponse {
  if (!json) return seeOther(PORTAL_LINK_ERROR_PATH);
  return NextResponse.json(
    { error: "invalid_link", message: PORTAL_LINK_INVALID_MESSAGE, redirect: PORTAL_LINK_ERROR_PATH },
    { status: 400, headers: NO_STORE }
  );
}

/**
 * Login CSRF guard: a cross-site page must not be able to post an attacker's token here and plant
 * that portal session in the victim's browser. `Sec-Fetch-Site` other than same-origin/none, or an
 * `Origin` that isn't APP_ORIGIN (the Host header when APP_ORIGIN isn't set), is rejected.
 */
function isCrossSite(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  const expected = getAppOrigin();
  if (expected) return origin !== expected;
  try {
    return new URL(origin).host !== request.headers.get("host");
  } catch {
    return true;
  }
}

/**
 * POST /api/portal/auth/verify `{ token }` (#506, replaces BE §B.4.2's code
 * check). 10 per 15 minutes per IP → 429. The token's hash is marked used in
 * one conditional update, so a link signs in once; a used, expired or
 * unknown token goes to `/portal/login?error=link`. On success: portal
 * session + cookie, `invited → active`, then the safe `return_to` (inside
 * `/portal`) or `/portal`. Form posts get a 303; JSON callers get
 * `{ redirect }`. Only this POST consumes a link; `/portal/acceder` never does.
 * A cross-site post gets the invalid-link answer without spending the link.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { token: rawToken, json } = await readBody(request);

  const ip = clientIp(request.headers);
  const limit = portalVerifyIpRateLimiter.hit(ip ?? "unknown");
  if (!limit.allowed) {
    const headers = { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) };
    if (!json) {
      return new NextResponse(PORTAL_RATE_LIMITED_MESSAGE, {
        status: 429,
        headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return NextResponse.json({ error: "rate_limited", message: PORTAL_RATE_LIMITED_MESSAGE }, { status: 429, headers });
  }

  if (isCrossSite(request)) return invalidLink(json);

  const token = parsePortalLinkToken(rawToken);
  if (!token) return invalidLink(json);

  const link = await consumePortalLoginLink(token);
  if (!link) return invalidLink(json);

  // A user disabled after the link was sent: the link is spent and no session is made.
  if (!(await recordPortalSignIn(link.portalUserId))) return invalidLink(json);

  await createPortalSession(link.portalUserId, { userAgent: request.headers.get("user-agent"), ip });
  after(cleanupPortalLoginRows);

  const target = portalSignInTarget(link.returnTo);
  if (!json) return seeOther(target);
  return NextResponse.json({ redirect: target }, { headers: NO_STORE });
}
