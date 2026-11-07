import { describe, expect, it } from "vitest";

import {
  parsePortalStyle,
  PORTAL_STYLE_COOKIE,
  PORTAL_STYLE_COOKIE_MAX_AGE,
  readPortalStyleCookie,
  resolvePortalStyle,
  serializePortalStyleCookie,
} from "@/lib/portal/style";

const allowed = { styleDefault: "esencial" as const, allowUserOverride: true };

describe("cincel-portal-style cookie", () => {
  it("is named cincel-portal-style", () => {
    expect(PORTAL_STYLE_COOKIE).toBe("cincel-portal-style");
  });

  it("serializes for every /portal page for a year", () => {
    expect(serializePortalStyleCookie("analitico")).toBe(
      `cincel-portal-style=analitico; path=/; max-age=${PORTAL_STYLE_COOKIE_MAX_AGE}; samesite=lax`,
    );
  });

  for (const style of ["visual", "esencial", "analitico"] as const) {
    it(`round trips ${style}: written, read back from the Cookie header, resolved`, () => {
      const written = serializePortalStyleCookie(style).split(";")[0];
      const header = `cincel_portal_session=abc; ${written}; other=1`;
      expect(readPortalStyleCookie(header)).toBe(style);
      expect(resolvePortalStyle(readPortalStyleCookie(header), allowed)).toBe(style);
    });
  }

  it("parses known styles, tolerating case and accents", () => {
    expect(parsePortalStyle("Analítico")).toBe("analitico");
    expect(parsePortalStyle(" VISUAL ")).toBe("visual");
    expect(parsePortalStyle("esencial")).toBe("esencial");
  });

  it("rejects anything else", () => {
    expect(parsePortalStyle("compacto")).toBeNull();
    expect(parsePortalStyle("")).toBeNull();
    expect(parsePortalStyle(undefined)).toBeNull();
    expect(parsePortalStyle(3)).toBeNull();
  });

  it("an invalid or missing cookie falls back to the organization default", () => {
    expect(resolvePortalStyle("compacto", allowed)).toBe("esencial");
    expect(resolvePortalStyle("<script>", allowed)).toBe("esencial");
    expect(resolvePortalStyle(undefined, allowed)).toBe("esencial");
    expect(resolvePortalStyle(null, allowed)).toBe("esencial");
    expect(readPortalStyleCookie(undefined)).toBeUndefined();
    expect(readPortalStyleCookie("cincel_portal_session=abc")).toBeUndefined();
  });

  it("ignores the cookie when the organization fixed the style", () => {
    expect(resolvePortalStyle("analitico", { styleDefault: "visual", allowUserOverride: false })).toBe("visual");
  });
});
