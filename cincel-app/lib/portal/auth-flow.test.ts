// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizePortalEmail,
  parsePortalLinkToken,
  portalAccessUrl,
  portalLinkEmailRateLimiter,
  portalLinkIpRateLimiter,
  portalReturnTo,
  portalSignInTarget,
  portalVerifyIpRateLimiter,
} from "./auth-flow";

const MINUTE = 60_000;

describe("normalizePortalEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizePortalEmail("  Cliente@Gmail.COM ")).toBe("cliente@gmail.com");
  });

  it.each([undefined, null, 3, "", "cliente", "cliente@", "@gmail.com", "a b@x.com"])("rejects %s", (value) => {
    expect(normalizePortalEmail(value)).toBeNull();
  });
});

describe("parsePortalLinkToken", () => {
  it("accepts the 64-hex tokens we issue", () => {
    const token = "a".repeat(64);
    expect(parsePortalLinkToken(token)).toBe(token);
  });

  it.each([undefined, "", "abc", "g".repeat(64), "a".repeat(65)])("rejects %s", (value) => {
    expect(parsePortalLinkToken(value)).toBeNull();
  });
});

describe("portal return_to", () => {
  beforeEach(() => vi.stubEnv("APP_ORIGIN", "https://app.example.test"));
  afterEach(() => vi.unstubAllEnvs());

  it("keeps portal paths with their query", () => {
    expect(portalReturnTo("/portal/proyectos/1?tab=archivos")).toBe("/portal/proyectos/1?tab=archivos");
    expect(portalSignInTarget("/portal/proyectos/1")).toBe("/portal/proyectos/1");
  });

  it.each(["https://evil.example.test/portal", "//evil.example.test", "/\\evil", "/dashboard", "/portalx", "portal"])(
    "drops %s and falls back to /portal",
    (value) => {
      expect(portalReturnTo(value)).toBeNull();
      expect(portalSignInTarget(value)).toBe("/portal");
    }
  );

  it("falls back to /portal without a return_to", () => {
    expect(portalSignInTarget(null)).toBe("/portal");
  });
});

describe("portalAccessUrl", () => {
  it("points at /portal/acceder on the given origin", () => {
    expect(portalAccessUrl("https://app.example.test", "ab12")).toBe("https://app.example.test/portal/acceder?token=ab12");
  });
});

describe("portal sign-in rate limits", () => {
  beforeEach(() => {
    portalLinkEmailRateLimiter.reset();
    portalLinkIpRateLimiter.reset();
    portalVerifyIpRateLimiter.reset();
  });

  it("allows 5 link requests per email per hour, the sixth is refused", () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) expect(portalLinkEmailRateLimiter.hit("a@x.com", now + i).allowed).toBe(true);
    expect(portalLinkEmailRateLimiter.hit("a@x.com", now + 5).allowed).toBe(false);
    expect(portalLinkEmailRateLimiter.hit("b@x.com", now + 5).allowed).toBe(true);
    expect(portalLinkEmailRateLimiter.hit("a@x.com", now + 60 * MINUTE).allowed).toBe(true);
  });

  it("allows 20 link requests per IP per hour", () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) expect(portalLinkIpRateLimiter.hit("1.2.3.4", now).allowed).toBe(true);
    expect(portalLinkIpRateLimiter.hit("1.2.3.4", now).allowed).toBe(false);
  });

  it("allows 10 verifies per IP per 15 minutes", () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) expect(portalVerifyIpRateLimiter.hit("1.2.3.4", now).allowed).toBe(true);
    expect(portalVerifyIpRateLimiter.hit("1.2.3.4", now).allowed).toBe(false);
    expect(portalVerifyIpRateLimiter.hit("1.2.3.4", now + 15 * MINUTE).allowed).toBe(true);
  });
});
