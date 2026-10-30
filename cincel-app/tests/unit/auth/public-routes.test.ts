import { describe, expect, it } from "vitest";

import { isPortalPath, isPublicPath, SIGN_OUT_TO_LOGIN_URL } from "@/lib/auth/public-routes";

describe("public routes", () => {
  it.each(["/login", "/login/denegado", "/change-password", "/portal", "/portal/login", "/portal/proyectos/abc"])(
    "%s is public",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each(["/", "/dashboard", "/configuracion", "/login/otra", "/portales", "/portal-x", "/change-password/x"])(
    "%s is not public",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );

  it("detects portal paths only for /portal and below", () => {
    expect(isPortalPath("/portal")).toBe(true);
    expect(isPortalPath("/portal/x")).toBe(true);
    expect(isPortalPath("/portales")).toBe(false);
    expect(isPortalPath("/login")).toBe(false);
  });

  it("signs out to /login with an encoded next", () => {
    expect(SIGN_OUT_TO_LOGIN_URL).toBe("/api/auth/signout?next=%2Flogin");
  });
});
