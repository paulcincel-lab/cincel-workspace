// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookieGetMock,
  cookieSetMock,
  exchangeMock,
  signInMock,
  recordDeniedMock,
  createSessionMock,
  getSessionMock,
  grantMock,
} = vi.hoisted(() => ({
  cookieGetMock: vi.fn(),
  cookieSetMock: vi.fn(),
  exchangeMock: vi.fn(),
  signInMock: vi.fn(),
  recordDeniedMock: vi.fn(),
  createSessionMock: vi.fn(),
  getSessionMock: vi.fn(),
  grantMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGetMock, set: cookieSetMock }),
}));

vi.mock("@/lib/auth/google-sign-in", () => ({
  signInWithGoogle: signInMock,
  recordGoogleSignInDenied: recordDeniedMock,
}));

vi.mock("@/lib/auth/session", () => ({ createSession: createSessionMock, getSession: getSessionMock }));

vi.mock("@/lib/auth/google-consent", () => ({ grantGoogleScope: grantMock }));

vi.mock("@/lib/google/staff-oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/staff-oauth")>()),
  exchangeStaffCode: exchangeMock,
}));

import { NextRequest } from "next/server";

import { STAFF_OAUTH_COOKIE, StaffOauthError } from "@/lib/google/staff-oauth";

import { GET } from "./route";

const ORIGIN = "https://app.cincel.example";
const STATE = "fake-state-value";

const identity = { sub: "100", email: "ana@cincel.example", name: "Ana", hd: "cincel.example" };
const tokens = { accessToken: "fake-access", refreshToken: null, scope: "openid email profile", expiresAt: new Date() };

function stateCookie(overrides: Record<string, unknown> = {}): string {
  const value = {
    state: STATE,
    codeVerifier: "fake-verifier",
    returnTo: "/dashboard",
    scope: null,
    issuedAt: Date.now(),
  };
  return Buffer.from(JSON.stringify({ ...value, ...overrides }), "utf8").toString("base64url");
}

function req(query = `code=fake-code&state=${STATE}`): NextRequest {
  return new NextRequest(`${ORIGIN}/api/auth/google/callback?${query}`, {
    headers: { "x-real-ip": "203.0.113.5", "user-agent": "vitest" },
  });
}

const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
  vi.stubEnv("APP_ORIGIN", ORIGIN);
  cookieGetMock.mockImplementation((name: string) =>
    name === STAFF_OAUTH_COOKIE ? { value: stateCookie() } : undefined,
  );
  exchangeMock.mockResolvedValue({ check: { ok: true, identity }, tokens });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/auth/google/callback", () => {
  it("is 404 with AUTH_GOOGLE_ENABLED off (the default)", async () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "");
    expect((await GET(req())).status).toBe(404);
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("creates the session only after the gate allows, then goes to the stored return_to", async () => {
    signInMock.mockResolvedValue({ status: "allowed", staffId: "staff-1" });
    const res = await GET(req());
    expect(exchangeMock).toHaveBeenCalledWith("fake-code", "fake-verifier");
    expect(signInMock).toHaveBeenCalledWith(identity, tokens, { ip: "203.0.113.5", userAgent: "vitest" });
    expect(createSessionMock).toHaveBeenCalledWith("staff-1", "vitest");
    expect(location(res)).toBe(`${ORIGIN}/dashboard`);
  });

  it("clears the state cookie", async () => {
    signInMock.mockResolvedValue({ status: "allowed", staffId: "staff-1" });
    await GET(req());
    expect(cookieSetMock).toHaveBeenCalledWith(STAFF_OAUTH_COOKIE, "", expect.objectContaining({ maxAge: 0 }));
  });

  it.each(["no_role_group", "workspace_suspended", "sub_mismatch", "needs_link", "inactive"])(
    "refuses %s without a session",
    async (reason) => {
      signInMock.mockResolvedValue({ status: "denied", reason, staffId: null });
      const res = await GET(req());
      expect(location(res)).toBe(`${ORIGIN}/login/denegado?motivo=${reason}`);
      expect(createSessionMock).not.toHaveBeenCalled();
    },
  );

  it("refuses an ID token outside the domain, records it, and never runs the gate", async () => {
    exchangeMock.mockResolvedValue({ check: { ok: false, reason: "domain", detail: "hd_mismatch" }, tokens });
    const res = await GET(req());
    expect(location(res)).toBe(`${ORIGIN}/login/denegado?motivo=domain`);
    expect(recordDeniedMock).toHaveBeenCalledWith("domain", { ip: "203.0.113.5", userAgent: "vitest" });
    expect(signInMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("asks for a retry on a Directory outage", async () => {
    signInMock.mockResolvedValue({ status: "retry" });
    expect(location(await GET(req()))).toBe(`${ORIGIN}/login?error=retry`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("sends a state mismatch to /login?error=state", async () => {
    expect(location(await GET(req("code=fake-code&state=other")))).toBe(`${ORIGIN}/login?error=state`);
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("sends a missing or expired state cookie to /login?error=state", async () => {
    cookieGetMock.mockReturnValue(undefined);
    expect(location(await GET(req()))).toBe(`${ORIGIN}/login?error=state`);
    cookieGetMock.mockReturnValue({ value: stateCookie({ issuedAt: Date.now() - 11 * 60 * 1000 }) });
    expect(location(await GET(req()))).toBe(`${ORIGIN}/login?error=state`);
  });

  it("sends a Google error or a missing code to /login?error=retry", async () => {
    expect(location(await GET(req(`error=access_denied&state=${STATE}`)))).toBe(`${ORIGIN}/login?error=retry`);
    expect(location(await GET(req(`state=${STATE}`)))).toBe(`${ORIGIN}/login?error=retry`);
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("turns a failed code exchange into /login?error=retry", async () => {
    exchangeMock.mockRejectedValue(new StaffOauthError("No se pudo canjear el código de Google"));
    expect(location(await GET(req()))).toBe(`${ORIGIN}/login?error=retry`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("never redirects to the request host", async () => {
    signInMock.mockResolvedValue({ status: "allowed", staffId: "staff-1" });
    const res = await GET(
      new NextRequest(`https://evil.example/api/auth/google/callback?code=fake-code&state=${STATE}`),
    );
    expect(location(res)).toBe(`${ORIGIN}/dashboard`);
  });
});

describe("GET /api/auth/google/callback with an incremental grant (scope)", () => {
  const session = {
    id: "session-1",
    user: { id: "staff-1", email: identity.email },
    staffAccess: { accessRevokedAt: null },
  };
  const scoped = (overrides: Record<string, unknown> = {}) => {
    const value = stateCookie({ scope: "drive", returnTo: "/proyectos/p1/archivos", ...overrides });
    cookieGetMock.mockImplementation((name: string) => (name === STAFF_OAUTH_COOKIE ? { value } : undefined));
  };

  beforeEach(() => {
    scoped();
    getSessionMock.mockResolvedValue(session);
  });

  it("stores the grant for the signed-in staff member and returns with google_connected=1", async () => {
    grantMock.mockResolvedValue({ status: "granted", staffId: "staff-1", linked: false });
    const res = await GET(req());
    expect(grantMock).toHaveBeenCalledWith("staff-1", "drive", identity, tokens, {
      ip: "203.0.113.5",
      userAgent: "vitest",
    });
    expect(location(res)).toBe(`${ORIGIN}/proyectos/p1/archivos?google_connected=1`);
    expect(signInMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("passes the calendar scope through", async () => {
    scoped({ scope: "calendar", returnTo: "/calendario" });
    grantMock.mockResolvedValue({ status: "granted", staffId: "staff-1", linked: true });
    const res = await GET(req());
    expect(grantMock).toHaveBeenCalledWith("staff-1", "calendar", identity, tokens, expect.anything());
    expect(location(res)).toBe(`${ORIGIN}/calendario?google_connected=1`);
  });

  it.each(["sub_mismatch", "no_role_group", "workspace_suspended"])(
    "keeps the session on %s and returns with the error params",
    async (reason) => {
      grantMock.mockResolvedValue({ status: "denied", reason });
      const res = await GET(req());
      expect(location(res)).toBe(`${ORIGIN}/proyectos/p1/archivos?google_connected=error&motivo=${reason}`);
      expect(createSessionMock).not.toHaveBeenCalled();
    },
  );

  it("reports a Directory outage or a missing scope as errors", async () => {
    grantMock.mockResolvedValue({ status: "retry" });
    expect(location(await GET(req()))).toBe(`${ORIGIN}/proyectos/p1/archivos?google_connected=error&motivo=retry`);
    grantMock.mockResolvedValue({ status: "scope_missing", staffId: "staff-1" });
    expect(location(await GET(req()))).toBe(
      `${ORIGIN}/proyectos/p1/archivos?google_connected=error&motivo=scope_missing`,
    );
  });

  it("keeps the existing return_to query", async () => {
    scoped({ returnTo: "/recursos?tab=drive" });
    grantMock.mockResolvedValue({ status: "granted", staffId: "staff-1", linked: false });
    expect(location(await GET(req()))).toBe(`${ORIGIN}/recursos?tab=drive&google_connected=1`);
  });

  it("refuses an ID token outside the domain without storing anything", async () => {
    exchangeMock.mockResolvedValue({ check: { ok: false, reason: "domain", detail: "hd_mismatch" }, tokens });
    const res = await GET(req());
    expect(location(res)).toBe(`${ORIGIN}/proyectos/p1/archivos?google_connected=error&motivo=domain`);
    expect(grantMock).not.toHaveBeenCalled();
  });

  it("returns with an error when the user cancels on Google", async () => {
    const res = await GET(req(`error=access_denied&state=${STATE}`));
    expect(location(res)).toBe(`${ORIGIN}/proyectos/p1/archivos?google_connected=error&motivo=retry`);
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("sends a browser without a session to /login and never exchanges the code", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(location(await GET(req()))).toBe(`${ORIGIN}/login`);
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("still checks the state", async () => {
    expect(location(await GET(req("code=fake-code&state=other")))).toBe(`${ORIGIN}/login?error=state`);
    expect(grantMock).not.toHaveBeenCalled();
  });
});
