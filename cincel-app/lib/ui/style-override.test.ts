import { describe, expect, it } from "vitest";

import {
  parsePresentationStyle,
  portalStyleCookie,
  readEstiloOverride,
  resolvePageStyle,
} from "@/lib/ui/style-override";
import { PORTAL_STYLE_COOKIE } from "@/lib/ui/preferences";

describe("parsePresentationStyle", () => {
  it("accepts the three styles, with accents and any case", () => {
    expect(parsePresentationStyle("visual")).toBe("visual");
    expect(parsePresentationStyle("Esencial")).toBe("esencial");
    expect(parsePresentationStyle("Analítico")).toBe("analitico");
    expect(parsePresentationStyle(" analitico ")).toBe("analitico");
  });

  it("rejects anything else", () => {
    expect(parsePresentationStyle("compacto")).toBeNull();
    expect(parsePresentationStyle("")).toBeNull();
    expect(parsePresentationStyle(undefined)).toBeNull();
    expect(parsePresentationStyle(3)).toBeNull();
  });
});

describe("readEstiloOverride", () => {
  it("reads ?estilo= from page searchParams objects", () => {
    expect(readEstiloOverride({ estilo: "esencial" })).toBe("esencial");
    expect(readEstiloOverride({ estilo: ["analitico", "visual"] })).toBe("analitico");
    expect(readEstiloOverride({ otro: "x" })).toBeNull();
    expect(readEstiloOverride({ estilo: "raro" })).toBeNull();
    expect(readEstiloOverride(undefined)).toBeNull();
  });

  it("reads ?estilo= from URLSearchParams", () => {
    expect(readEstiloOverride(new URLSearchParams("estilo=visual&x=1"))).toBe("visual");
    expect(readEstiloOverride(new URLSearchParams("x=1"))).toBeNull();
  });
});

describe("resolvePageStyle", () => {
  const base = { styleDefault: "visual" as const, allowUserOverride: true };

  it("the URL override wins and marks the style as overridden", () => {
    expect(resolvePageStyle({ ...base, override: "analitico", chosen: "esencial" })).toEqual({
      style: "analitico",
      isOverridden: true,
      fixedByOrg: false,
    });
  });

  it("uses the user's style when the organization allows it", () => {
    expect(resolvePageStyle({ ...base, override: null, chosen: "esencial" })).toEqual({
      style: "esencial",
      isOverridden: false,
      fixedByOrg: false,
    });
  });

  it("falls back to the org default when there is no choice", () => {
    expect(resolvePageStyle({ ...base, override: null, chosen: null }).style).toBe("visual");
  });

  it("ignores the user's style and reports fixed when the organization fixed it", () => {
    expect(
      resolvePageStyle({ override: null, chosen: "esencial", styleDefault: "analitico", allowUserOverride: false }),
    ).toEqual({ style: "analitico", isOverridden: false, fixedByOrg: true });
  });

  it("still applies the URL override when the style is fixed", () => {
    expect(
      resolvePageStyle({ override: "esencial", chosen: null, styleDefault: "analitico", allowUserOverride: false }),
    ).toEqual({ style: "esencial", isOverridden: true, fixedByOrg: true });
  });
});

describe("portalStyleCookie", () => {
  it("writes the cincel-portal-style cookie for a year on the whole site", () => {
    const cookie = portalStyleCookie(PORTAL_STYLE_COOKIE, "esencial");
    expect(cookie).toMatch(/^cincel-portal-style=esencial; /);
    expect(cookie).toContain("path=/");
    expect(cookie).toContain(`max-age=${60 * 60 * 24 * 365}`);
    expect(cookie).toContain("samesite=lax");
  });
});
