import { describe, expect, it } from "vitest";

import { clientIp, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit inside the window, then refuses with Retry-After", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.hit("a", 0)).toEqual({ allowed: true });
    expect(limiter.hit("a", 1_000)).toEqual({ allowed: true });
    expect(limiter.hit("a", 2_000)).toEqual({ allowed: true });
    expect(limiter.hit("a", 3_000)).toEqual({ allowed: false, retryAfterSeconds: 57 });
  });

  it("slides: a hit leaves the window once it is older than windowMs", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 10_000 });
    limiter.hit("a", 0);
    limiter.hit("a", 5_000);
    expect(limiter.hit("a", 9_999).allowed).toBe(false);
    expect(limiter.hit("a", 10_000)).toEqual({ allowed: true });
    expect(limiter.hit("a", 10_001).allowed).toBe(false);
  });

  it("counts each key on its own", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000 });
    expect(limiter.hit("a", 0).allowed).toBe(true);
    expect(limiter.hit("b", 0).allowed).toBe(true);
    expect(limiter.hit("a", 1).allowed).toBe(false);
  });

  it("forgets everything on reset", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000 });
    limiter.hit("a", 0);
    limiter.reset();
    expect(limiter.hit("a", 1).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("reads X-Real-IP and ignores X-Forwarded-For", () => {
    expect(clientIp(new Headers({ "x-real-ip": " 203.0.113.9 ", "x-forwarded-for": "198.51.100.1" }))).toBe(
      "203.0.113.9",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1" }))).toBeNull();
  });
});
