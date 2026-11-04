// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/portal/auth/verify over a fake single-use link store: one
 * success per token, a session and activation on success, a safe return_to
 * only, the "pide uno nuevo" redirect otherwise, and the per-IP limit.
 */

const mocks = vi.hoisted(() => ({
  links: new Map<string, { portalUserId: string; returnTo: string | null; usedAt: Date | null; expired: boolean }>(),
  disabled: new Set<string>(),
  activated: [] as string[],
  createPortalSession: vi.fn(),
  cleanupPortalLoginRows: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => unknown) => mocks.afterCallbacks.push(callback),
}));

vi.mock("@/lib/portal/login-links", () => ({
  // Mirrors the conditional update: unknown, used or expired → null; otherwise mark used.
  consumePortalLoginLink: vi.fn(async (token: string) => {
    const link = mocks.links.get(token);
    if (!link || link.usedAt || link.expired) return null;
    link.usedAt = new Date();
    return { portalUserId: link.portalUserId, returnTo: link.returnTo };
  }),
  recordPortalSignIn: vi.fn(async (portalUserId: string) => {
    if (mocks.disabled.has(portalUserId)) return false;
    mocks.activated.push(portalUserId);
    return true;
  }),
  cleanupPortalLoginRows: mocks.cleanupPortalLoginRows,
}));

vi.mock("@/lib/portal/session", () => ({ createPortalSession: mocks.createPortalSession }));

const { POST } = await import("./route");
const { portalVerifyIpRateLimiter, PORTAL_LINK_INVALID_MESSAGE } = await import("@/lib/portal/auth-flow");

const TOKEN = "a".repeat(64);
const ORIGIN = "https://app.example.test";

function form(token: string | null, ip = "10.0.0.1", extraHeaders: Record<string, string> = {}) {
  const body = new URLSearchParams();
  if (token !== null) body.set("token", token);
  return POST(
    new NextRequest("http://internal.host:3000/api/portal/auth/verify", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-real-ip": ip,
        "user-agent": "UA",
        ...extraHeaders,
      },
      body,
    })
  );
}

function json(token: unknown, ip = "10.0.0.1") {
  return POST(
    new NextRequest("http://internal.host:3000/api/portal/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ token }),
    })
  );
}

function link(returnTo: string | null = null, extra: { expired?: boolean; portalUserId?: string } = {}) {
  mocks.links.set(TOKEN, {
    portalUserId: extra.portalUserId ?? "pu-1",
    returnTo,
    usedAt: null,
    expired: extra.expired ?? false,
  });
}

describe("POST /api/portal/auth/verify", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", ORIGIN);
    portalVerifyIpRateLimiter.reset();
    mocks.links.clear();
    mocks.disabled.clear();
    mocks.activated.length = 0;
    mocks.afterCallbacks.length = 0;
    mocks.createPortalSession.mockReset();
    mocks.createPortalSession.mockResolvedValue({ token: "s", expiresAt: new Date() });
    mocks.cleanupPortalLoginRows.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("signs in, activates the user and redirects to /portal", async () => {
    link();
    const res = await form(TOKEN);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/portal`);
    expect(mocks.activated).toEqual(["pu-1"]);
    expect(mocks.createPortalSession).toHaveBeenCalledExactlyOnceWith("pu-1", { userAgent: "UA", ip: "10.0.0.1" });
    expect(mocks.afterCallbacks).toEqual([mocks.cleanupPortalLoginRows]);
  });

  it("honours a safe portal return_to", async () => {
    link("/portal/proyectos/1?tab=archivos");
    const res = await form(TOKEN);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/portal/proyectos/1?tab=archivos`);
  });

  it.each(["//evil.example.test", "https://evil.example.test/portal", "/dashboard"])(
    "ignores the unsafe return_to %s",
    async (returnTo) => {
      link(returnTo);
      const res = await form(TOKEN);
      expect(res.headers.get("location")).toBe(`${ORIGIN}/portal`);
    }
  );

  it("works once: a second use goes to /portal/login?error=link", async () => {
    link();
    expect((await form(TOKEN)).headers.get("location")).toBe(`${ORIGIN}/portal`);
    const again = await form(TOKEN);
    expect(again.status).toBe(303);
    expect(again.headers.get("location")).toBe(`${ORIGIN}/portal/login?error=link`);
    expect(mocks.createPortalSession).toHaveBeenCalledTimes(1);
  });

  it("only one of two concurrent uses of the same token succeeds", async () => {
    link();
    const results = await Promise.all([form(TOKEN), form(TOKEN)]);
    const locations = results.map((res) => res.headers.get("location")).sort();
    expect(locations).toEqual([`${ORIGIN}/portal`, `${ORIGIN}/portal/login?error=link`]);
    expect(mocks.createPortalSession).toHaveBeenCalledTimes(1);
  });

  it("fails for an expired link", async () => {
    link(null, { expired: true });
    const res = await form(TOKEN);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/portal/login?error=link`);
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });

  it.each([null, "", "not-a-token", "b".repeat(64)])("fails for the unknown or malformed token %s", async (token) => {
    const res = await form(token);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/portal/login?error=link`);
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });

  it("makes no session for a user disabled after the link was sent", async () => {
    link(null, { portalUserId: "pu-off" });
    mocks.disabled.add("pu-off");
    const res = await form(TOKEN);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/portal/login?error=link`);
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });

  it("answers JSON callers with { redirect } or the invalid-link message", async () => {
    link("/portal/proyectos/2");
    const ok = await json(TOKEN);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ redirect: "/portal/proyectos/2" });

    const bad = await json(TOKEN);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({
      error: "invalid_link",
      message: PORTAL_LINK_INVALID_MESSAGE,
      redirect: "/portal/login?error=link",
    });
  });

  it.each<Record<string, string>>([
    { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    { origin: "https://evil.example" },
    { "sec-fetch-site": "same-site" },
  ])("rejects a cross-site form post without spending the link (%o)", async (headers) => {
    link();
    const res = await form(TOKEN, "10.0.0.3", headers);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/portal/login?error=link`);
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
    expect(mocks.links.get(TOKEN)?.usedAt).toBeNull();
  });

  it("accepts a same-origin form post", async () => {
    link();
    const res = await form(TOKEN, "10.0.0.4", { origin: ORIGIN, "sec-fetch-site": "same-origin" });
    expect(res.headers.get("location")).toBe(`${ORIGIN}/portal`);
    expect(mocks.createPortalSession).toHaveBeenCalledTimes(1);
  });

  it("returns 429 on the eleventh verify from one IP in 15 minutes", async () => {
    for (let i = 0; i < 10; i++) expect((await form("c".repeat(64))).status).toBe(303);
    const res = await form("c".repeat(64));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect((await json("c".repeat(64))).status).toBe(429);
    expect((await form("c".repeat(64), "10.0.0.2")).status).toBe(303);
  });
});
