// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { middleware } from "@/middleware";
import { PORTAL_SESSION_COOKIE, PORTAL_SESSION_MAX_AGE_S, SESSION_COOKIE } from "@/lib/auth/session-cookie";

function run(path: string, withCookie: boolean, withPortalCookie = false) {
  const headers = new Headers();
  const cookies = [
    withCookie ? `${SESSION_COOKIE}=fake-stale-token` : null,
    withPortalCookie ? `${PORTAL_SESSION_COOKIE}=fake-portal-token` : null,
  ].filter(Boolean);
  if (cookies.length > 0) headers.set("cookie", cookies.join("; "));
  return middleware(new NextRequest(`http://localhost:3000${path}`, { headers }));
}

function redirectTarget(response: Response): string | null {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname : null;
}

describe("middleware", () => {
  it("redirects a protected path without a cookie to /login", () => {
    expect(redirectTarget(run("/dashboard", false))).toBe("/login");
  });

  it.each(["/login", "/login/denegado", "/change-password", "/portal/login", "/portal/acceder"])(
    "lets %s through without a staff cookie",
    (path) => {
      expect(redirectTarget(run(path, false))).toBeNull();
    },
  );

  it("does not redirect /login to /dashboard when a (possibly stale) cookie is present", () => {
    expect(redirectTarget(run("/login", true))).toBeNull();
  });

  it("lets a protected path with a cookie through to the server checks", () => {
    expect(redirectTarget(run("/dashboard", true))).toBeNull();
  });

  it("never touches /api routes", () => {
    expect(redirectTarget(run("/api/auth/signout", false))).toBeNull();
    expect(redirectTarget(run("/api/portal/auth/logout", false))).toBeNull();
  });
});

describe("middleware portal gate", () => {
  it.each(["/portal", "/portal/proyectos/1", "/portal/proyectos/1/cronograma"])(
    "redirects %s without the portal cookie to /portal/login",
    (path) => {
      expect(redirectTarget(run(path, false))).toBe("/portal/login");
    },
  );

  it("drops the query string on the redirect to /portal/login", () => {
    const location = run("/portal/proyectos/1?tab=cronograma", false).headers.get("location");
    expect(location ? new URL(location).search : null).toBe("");
  });

  it("keeps /portal/login and /portal/acceder public, including the magic-link query", () => {
    expect(redirectTarget(run("/portal/login", false))).toBeNull();
    expect(redirectTarget(run("/portal/login?email=ana%40example.com", false))).toBeNull();
    expect(redirectTarget(run("/portal/acceder?token=abc", false))).toBeNull();
  });

  it("lets /portal/* through with the portal cookie", () => {
    expect(redirectTarget(run("/portal", false, true))).toBeNull();
    expect(redirectTarget(run("/portal/proyectos/1", false, true))).toBeNull();
  });

  it("re-issues the portal cookie with a fresh 30-day expiry on every protected portal page", () => {
    // Day 1: page render (Server Component slides the DB row but can't write the cookie); day 29: another page.
    for (const path of ["/portal", "/portal/proyectos/1/cronograma"]) {
      const cookie = (run(path, false, true) as NextResponse).cookies.get(PORTAL_SESSION_COOKIE);
      expect(cookie?.value).toBe("fake-portal-token");
      expect(cookie?.maxAge).toBe(PORTAL_SESSION_MAX_AGE_S);
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe("lax");
      expect(cookie?.path).toBe("/");
    }
  });

  it("does not re-issue the portal cookie on public portal pages or without one", () => {
    expect((run("/portal/login", false, true) as NextResponse).cookies.get(PORTAL_SESSION_COOKIE)).toBeUndefined();
    expect((run("/portal/acceder?token=abc", false, true) as NextResponse).cookies.get(PORTAL_SESSION_COOKIE))
      .toBeUndefined();
    expect((run("/dashboard", true, true) as NextResponse).cookies.get(PORTAL_SESSION_COOKIE)).toBeUndefined();
  });

  it("does not accept the staff cookie as a portal session", () => {
    expect(redirectTarget(run("/portal/proyectos/1", true))).toBe("/portal/login");
  });

  it("does not accept the portal cookie as a staff session", () => {
    expect(redirectTarget(run("/dashboard", false, true))).toBe("/login");
  });

  it("does not send /portal paths to the staff /login", () => {
    expect(redirectTarget(run("/portal", false))).not.toBe("/login");
  });

  it("leaves lookalike paths under the staff gate", () => {
    expect(redirectTarget(run("/portales", false))).toBe("/login");
  });
});
