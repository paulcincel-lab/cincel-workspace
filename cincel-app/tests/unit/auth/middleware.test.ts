// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "@/middleware";
import { SESSION_COOKIE } from "@/lib/auth/session-cookie";

function run(path: string, withCookie: boolean) {
  const headers = new Headers();
  if (withCookie) headers.set("cookie", `${SESSION_COOKIE}=fake-stale-token`);
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

  it.each(["/login", "/login/denegado", "/change-password", "/portal", "/portal/login", "/portal/proyectos/1"])(
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
  });
});
