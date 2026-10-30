import { createHash } from "node:crypto";

import { OAuth2Client } from "google-auth-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories/google-oauth-repository", () => ({
  getGoogleOauthAccount: vi.fn(),
  updateGoogleOauthTokens: vi.fn(),
}));

import {
  DRIVE_READONLY_SCOPE,
  STAFF_OAUTH_COOKIE,
  StaffOauthError,
  StaffOauthInvalidGrantError,
  checkStaffIdTokenClaims,
  clearStaffOauthCookie,
  createPkcePair,
  exchangeStaffCode,
  parseStaffOauthScope,
  refreshStaffAccessToken,
  staffOauthConfig,
  startStaffOauth,
  verifyStaffIdToken,
  verifyStaffOauthState,
} from "./staff-oauth";
import { CALENDAR_SCOPE } from "./oauth";

const env = {
  GOOGLE_OAUTH_CLIENT_ID: "fake-client-id.apps.example.test",
  GOOGLE_OAUTH_CLIENT_SECRET: "fake-client-secret",
  APP_ORIGIN: "https://app.example.test",
  GOOGLE_WORKSPACE_DOMAIN: "Example.test",
};

const validClaims = {
  sub: "1234567890",
  email: "Ana@Example.test",
  email_verified: true,
  hd: "example.test",
  name: "Ana López",
};

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

function stateFromCookie(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("staffOauthConfig", () => {
  it("builds the redirect URI from APP_ORIGIN and lowercases the domain", () => {
    expect(staffOauthConfig(env)).toEqual({
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      workspaceDomain: "example.test",
      redirectUri: "https://app.example.test/api/auth/google/callback",
    });
  });

  it.each(["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "APP_ORIGIN", "GOOGLE_WORKSPACE_DOMAIN"])(
    "null without %s",
    (name) => {
      expect(staffOauthConfig({ ...env, [name]: "" })).toBeNull();
    },
  );

  it("startStaffOauth throws when not configured", () => {
    expect(() => startStaffOauth({}, {})).toThrow(StaffOauthError);
  });
});

describe("parseStaffOauthScope", () => {
  it("accepts drive and calendar only", () => {
    expect(parseStaffOauthScope("drive")).toBe("drive");
    expect(parseStaffOauthScope("calendar")).toBe("calendar");
    expect(parseStaffOauthScope("admin")).toBeNull();
    expect(parseStaffOauthScope(null)).toBeNull();
  });
});

describe("createPkcePair", () => {
  it("challenge is the base64url SHA-256 of the verifier", () => {
    const { codeVerifier, codeChallenge } = createPkcePair();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).toBe(createHash("sha256").update(codeVerifier).digest("base64url"));
    expect(createPkcePair().codeVerifier).not.toBe(codeVerifier);
  });
});

describe("startStaffOauth", () => {
  it("sign-in URL: openid email profile, hd, select_account, state and S256 challenge", () => {
    const { url, cookie } = startStaffOauth({}, env, 1_000);
    const p = params(url);
    const stored = stateFromCookie(cookie.value);

    expect(url.startsWith("https://accounts.google.com/")).toBe(true);
    expect(p.get("client_id")).toBe(env.GOOGLE_OAUTH_CLIENT_ID);
    expect(p.get("redirect_uri")).toBe("https://app.example.test/api/auth/google/callback");
    expect(p.get("response_type")).toBe("code");
    expect(p.get("scope")).toBe("openid email profile");
    expect(p.get("hd")).toBe("example.test");
    expect(p.get("prompt")).toBe("select_account");
    expect(p.get("login_hint")).toBeNull();
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("include_granted_scopes")).toBe("true");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("state")).toBe(stored.state);
    expect(p.get("code_challenge")).toBe(
      createHash("sha256")
        .update(stored.codeVerifier as string)
        .digest("base64url"),
    );
    // The verifier never leaves the server-side cookie.
    expect(url).not.toContain(stored.codeVerifier as string);
    expect(stored).toMatchObject({
      returnTo: "/dashboard",
      scope: null,
      issuedAt: 1_000,
    });
  });

  it("state cookie: httpOnly, lax, 10 minutes, secure only in production", () => {
    const { cookie } = startStaffOauth({}, env);
    expect(cookie.name).toBe(STAFF_OAUTH_COOKIE);
    expect(cookie.options).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    expect(startStaffOauth({}, { ...env, NODE_ENV: "production" }).cookie.options.secure).toBe(true);
  });

  it("incremental Drive grant adds drive.readonly with consent and login_hint", () => {
    const { url, cookie } = startStaffOauth({ scope: "drive", loginHint: "ana@example.test" }, env);
    const p = params(url);
    expect(p.get("scope")).toBe(`openid email profile ${DRIVE_READONLY_SCOPE}`);
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("login_hint")).toBe("ana@example.test");
    expect(p.get("hd")).toBe("example.test");
    expect(stateFromCookie(cookie.value).scope).toBe("drive");
  });

  it("incremental Calendar grant adds calendar.app.created", () => {
    const { url } = startStaffOauth({ scope: "calendar" }, env);
    expect(params(url).get("scope")).toBe(`openid email profile ${CALENDAR_SCOPE}`);
  });

  it("stores a safe return target and falls back for unsafe ones", () => {
    const keep = startStaffOauth({ returnTo: "/proyectos/1?tab=archivos" }, env).cookie.value;
    expect(stateFromCookie(keep).returnTo).toBe("/proyectos/1?tab=archivos");
    for (const unsafe of ["//evil.example", "/\\evil.example", "https://evil.example"]) {
      expect(stateFromCookie(startStaffOauth({ returnTo: unsafe }, env).cookie.value).returnTo).toBe("/dashboard");
    }
  });

  it("uses a new state and verifier every time", () => {
    const a = stateFromCookie(startStaffOauth({}, env).cookie.value);
    const b = stateFromCookie(startStaffOauth({}, env).cookie.value);
    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });

  it("clearStaffOauthCookie expires the cookie", () => {
    expect(clearStaffOauthCookie(env)).toMatchObject({
      name: STAFF_OAUTH_COOKIE,
      value: "",
      options: { maxAge: 0 },
    });
  });
});

describe("verifyStaffOauthState", () => {
  const now = 1_700_000_000_000;

  function started() {
    const { url, cookie } = startStaffOauth({ returnTo: "/recursos", scope: "drive" }, env, now);
    return { state: params(url).get("state")!, cookie: cookie.value };
  }

  it("returns the stored values when the state matches", () => {
    const { state, cookie } = started();
    const stored = verifyStaffOauthState(cookie, state, now + 60_000);
    expect(stored).toMatchObject({
      state,
      returnTo: "/recursos",
      scope: "drive",
      issuedAt: now,
    });
    expect(stored?.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("rejects a state mismatch", () => {
    const { cookie } = started();
    expect(verifyStaffOauthState(cookie, "another-state", now)).toBeNull();
  });

  it("rejects a missing cookie or state", () => {
    const { state, cookie } = started();
    expect(verifyStaffOauthState(undefined, state, now)).toBeNull();
    expect(verifyStaffOauthState("", state, now)).toBeNull();
    expect(verifyStaffOauthState(cookie, null, now)).toBeNull();
    expect(verifyStaffOauthState(cookie, "", now)).toBeNull();
  });

  it("rejects the cookie of another flow (state/PKCE pair mismatch)", () => {
    const first = started();
    const second = started();
    expect(verifyStaffOauthState(first.cookie, second.state, now)).toBeNull();
  });

  it("rejects a cookie older than 10 minutes or from the future", () => {
    const { state, cookie } = started();
    expect(verifyStaffOauthState(cookie, state, now + 10 * 60_000)).not.toBeNull();
    expect(verifyStaffOauthState(cookie, state, now + 10 * 60_000 + 1)).toBeNull();
    expect(verifyStaffOauthState(cookie, state, now - 1)).toBeNull();
  });

  it("rejects malformed or tampered cookies", () => {
    const { state } = started();
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    expect(verifyStaffOauthState("not-base64-json", state, now)).toBeNull();
    expect(verifyStaffOauthState(encode({ state }), state, now)).toBeNull();
    expect(
      verifyStaffOauthState(
        encode({
          state,
          codeVerifier: "",
          returnTo: "/",
          scope: null,
          issuedAt: now,
        }),
        state,
        now,
      ),
    ).toBeNull();
    expect(
      verifyStaffOauthState(
        encode({
          state,
          codeVerifier: "v",
          returnTo: "/",
          scope: "admin",
          issuedAt: now,
        }),
        state,
        now,
      ),
    ).toBeNull();
  });
});

describe("checkStaffIdTokenClaims", () => {
  it("accepts a verified account of the Workspace domain", () => {
    expect(checkStaffIdTokenClaims(validClaims, "example.test")).toEqual({
      ok: true,
      identity: {
        sub: "1234567890",
        email: "ana@example.test",
        name: "Ana López",
        hd: "example.test",
      },
    });
  });

  it("rejects an hd mismatch", () => {
    expect(checkStaffIdTokenClaims({ ...validClaims, hd: "other.test" }, "example.test")).toEqual({
      ok: false,
      reason: "domain",
      detail: "hd_mismatch",
    });
  });

  it("rejects a token without hd (personal account)", () => {
    expect(checkStaffIdTokenClaims({ ...validClaims, hd: undefined }, "example.test")).toMatchObject({
      ok: false,
      detail: "hd_mismatch",
    });
  });

  it("rejects an unverified email", () => {
    expect(checkStaffIdTokenClaims({ ...validClaims, email_verified: false }, "example.test")).toEqual({
      ok: false,
      reason: "domain",
      detail: "email_unverified",
    });
    expect(checkStaffIdTokenClaims({ ...validClaims, email_verified: undefined }, "example.test")).toMatchObject({
      ok: false,
      detail: "email_unverified",
    });
  });

  it("rejects tokens without sub or email", () => {
    expect(checkStaffIdTokenClaims({ ...validClaims, sub: "" }, "example.test")).toMatchObject({
      ok: false,
      detail: "missing_claims",
    });
    expect(checkStaffIdTokenClaims({ ...validClaims, email: undefined }, "example.test")).toMatchObject({
      ok: false,
      detail: "missing_claims",
    });
  });
});

describe("verifyStaffIdToken", () => {
  it("verifies with the client ID as audience, then checks hd and email_verified", async () => {
    const verify = vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue({
      getPayload: () => ({ ...validClaims, hd: "other.test" }),
    } as never);
    await expect(verifyStaffIdToken("fake-id-token", env)).resolves.toMatchObject({ ok: false, detail: "hd_mismatch" });
    expect(verify).toHaveBeenCalledWith({
      idToken: "fake-id-token",
      audience: env.GOOGLE_OAUTH_CLIENT_ID,
    });
  });

  it("throws StaffOauthError for an invalid signature, audience or expiry", async () => {
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockRejectedValue(new Error("Wrong recipient"));
    await expect(verifyStaffIdToken("fake-id-token", env)).rejects.toBeInstanceOf(StaffOauthError);
  });

  it("throws when the ticket has no payload", async () => {
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue({
      getPayload: () => undefined,
    } as never);
    await expect(verifyStaffIdToken("fake-id-token", env)).rejects.toBeInstanceOf(StaffOauthError);
  });
});

describe("exchangeStaffCode", () => {
  beforeEach(() => {
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue({
      getPayload: () => validClaims,
    } as never);
  });

  it("exchanges the code with the PKCE verifier and returns identity and tokens", async () => {
    const getToken = vi.spyOn(OAuth2Client.prototype, "getToken").mockResolvedValue({
      tokens: {
        id_token: "fake-id-token",
        access_token: "fake-access-token",
        refresh_token: "fake-refresh-token",
        scope: "openid email profile",
        expiry_date: 2_000_000_000_000,
      },
    } as never);

    const result = await exchangeStaffCode("fake-code", "fake-verifier", env);

    expect(getToken).toHaveBeenCalledWith({
      code: "fake-code",
      codeVerifier: "fake-verifier",
      redirect_uri: "https://app.example.test/api/auth/google/callback",
    });
    expect(result.check).toMatchObject({
      ok: true,
      identity: { sub: "1234567890", email: "ana@example.test" },
    });
    expect(result.tokens).toEqual({
      accessToken: "fake-access-token",
      refreshToken: "fake-refresh-token",
      scope: "openid email profile",
      expiresAt: new Date(2_000_000_000_000),
    });
  });

  it("throws when the exchange fails (e.g. wrong code_verifier)", async () => {
    vi.spyOn(OAuth2Client.prototype, "getToken").mockRejectedValue(new Error("invalid_grant"));
    await expect(exchangeStaffCode("fake-code", "wrong-verifier", env)).rejects.toBeInstanceOf(StaffOauthError);
  });

  it("throws when Google returns no ID token", async () => {
    vi.spyOn(OAuth2Client.prototype, "getToken").mockResolvedValue({
      tokens: { access_token: "fake-access-token" },
    } as never);
    await expect(exchangeStaffCode("fake-code", "fake-verifier", env)).rejects.toBeInstanceOf(StaffOauthError);
  });
});

describe("refreshStaffAccessToken", () => {
  it("returns the refreshed access token", async () => {
    vi.spyOn(OAuth2Client.prototype, "refreshAccessToken").mockResolvedValue({
      credentials: {
        access_token: "fake-new-access-token",
        expiry_date: 2_000_000_000_000,
        scope: "openid",
      },
    } as never);
    await expect(refreshStaffAccessToken("fake-refresh-token", env)).resolves.toEqual({
      accessToken: "fake-new-access-token",
      expiresAt: new Date(2_000_000_000_000),
      scope: "openid",
    });
  });

  it("throws StaffOauthInvalidGrantError on invalid_grant", async () => {
    vi.spyOn(OAuth2Client.prototype, "refreshAccessToken").mockRejectedValue(
      Object.assign(new Error("invalid_grant"), {
        response: { data: { error: "invalid_grant" } },
      }),
    );
    await expect(refreshStaffAccessToken("fake-refresh-token", env)).rejects.toBeInstanceOf(
      StaffOauthInvalidGrantError,
    );
  });

  it("throws StaffOauthError on other failures", async () => {
    vi.spyOn(OAuth2Client.prototype, "refreshAccessToken").mockRejectedValue(new Error("ETIMEDOUT"));
    const error = await refreshStaffAccessToken("fake-refresh-token", env).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StaffOauthError);
    expect(error).not.toBeInstanceOf(StaffOauthInvalidGrantError);
  });
});
