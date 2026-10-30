// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieSetMock } = vi.hoisted(() => ({ cookieSetMock: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSetMock }),
}));

import { NextRequest } from "next/server";

import { googleStartRateLimiter } from "@/lib/auth/rate-limit";
import { STAFF_OAUTH_COOKIE } from "@/lib/google/staff-oauth";

import { GET } from "./route";

const ORIGIN = "https://app.cincel.example";

function req(path = "/api/auth/google/start", ip = "203.0.113.5"): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, { headers: { "x-real-ip": ip } });
}

beforeEach(() => {
  vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
  vi.stubEnv("APP_ORIGIN", ORIGIN);
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "fake-client-id.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "fake-client-secret");
  vi.stubEnv("GOOGLE_WORKSPACE_DOMAIN", "cincel.example");
  googleStartRateLimiter.reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/auth/google/start", () => {
  it("is 404 with AUTH_GOOGLE_ENABLED off (the default)", async () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "");
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it("redirects to Google with hd, PKCE and state, and sets the state cookie", async () => {
    const res = await GET(req("/api/auth/google/start?return_to=%2Fproyectos"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("hd")).toBe("cincel.example");
    expect(location.searchParams.get("prompt")).toBe("select_account");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/google/callback`);

    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieSetMock.mock.calls[0];
    expect(name).toBe(STAFF_OAUTH_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: 600 });
    const stored = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    expect(stored).toMatchObject({ state: location.searchParams.get("state"), returnTo: "/proyectos", scope: null });
  });

  it("drops an off-site return_to", async () => {
    await GET(req("/api/auth/google/start?return_to=%2F%2Fevil.example"));
    const stored = JSON.parse(Buffer.from(cookieSetMock.mock.calls[0][1], "base64url").toString("utf8"));
    expect(stored.returnTo).toBe("/dashboard");
  });

  it("allows 20 starts per IP in 10 minutes, then answers 429", async () => {
    for (let i = 0; i < 20; i++) expect((await GET(req())).status).toBe(307);
    const limited = await GET(req());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another IP is counted on its own.
    expect((await GET(req(undefined, "203.0.113.6"))).status).toBe(307);
  });

  it("sends the browser to /login?error=retry when the OAuth client isn't configured", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    const res = await GET(req());
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=retry`);
    expect(cookieSetMock).not.toHaveBeenCalled();
  });
});
