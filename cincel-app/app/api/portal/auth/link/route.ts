import { after, NextResponse, type NextRequest } from "next/server";

import { clientIp } from "@/lib/auth/rate-limit";
import { getAppOrigin } from "@/lib/auth/safe-return-to";
import { sendMail } from "@/lib/email";
import { enlaceAccesoEmail } from "@/lib/email/templates";
import {
  normalizePortalEmail,
  PORTAL_LINK_SENT_MESSAGE,
  PORTAL_RATE_LIMITED_MESSAGE,
  portalAccessUrl,
  portalLinkEmailRateLimiter,
  portalLinkIpRateLimiter,
  portalReturnTo,
} from "@/lib/portal/auth-flow";
import { issuePortalLoginLink } from "@/lib/portal/login-links";

const NO_STORE = { "Cache-Control": "no-store" };

function rateLimited(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limited", message: PORTAL_RATE_LIMITED_MESSAGE },
    { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfterSeconds) } }
  );
}

/**
 * POST /api/portal/auth/link `{ email, return_to? }` (#506, replaces BE
 * §B.4.2's code request). 5 per hour per email and 20 per hour per IP → 429.
 * Known `invited`/`active` users get a 15-minute single-use link by email,
 * sent after the response; unknown and disabled emails run the same query
 * and get the same 200, and nothing is sent (§B.8 #2).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { email?: unknown; return_to?: unknown } = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }
  const email = normalizePortalEmail(body.email);
  if (!email) return NextResponse.json({ error: "invalid_email" }, { status: 400, headers: NO_STORE });

  const ip = clientIp(request.headers);
  const byIp = portalLinkIpRateLimiter.hit(ip ?? "unknown");
  if (!byIp.allowed) return rateLimited(byIp.retryAfterSeconds);
  const byEmail = portalLinkEmailRateLimiter.hit(email);
  if (!byEmail.allowed) return rateLimited(byEmail.retryAfterSeconds);

  const link = await issuePortalLoginLink({ email, returnTo: portalReturnTo(body.return_to), ip });

  if (link) {
    const origin = getAppOrigin();
    if (!origin) {
      console.error("[portal/auth/link] APP_ORIGIN is not set; the sign-in link can't be built");
    } else {
      const url = portalAccessUrl(origin, link.token);
      after(async () => {
        await sendMail({ to: link.email, ...enlaceAccesoEmail({ url }) });
      });
    }
  }

  return NextResponse.json({ message: PORTAL_LINK_SENT_MESSAGE }, { headers: NO_STORE });
}
