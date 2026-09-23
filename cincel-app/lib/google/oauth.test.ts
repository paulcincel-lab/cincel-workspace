import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { generateAuthUrlMock, getTokenMock, requestMock, refreshAccessTokenMock, revokeTokenMock, setCredentialsMock } =
  vi.hoisted(() => ({
    generateAuthUrlMock: vi.fn(),
    getTokenMock: vi.fn(),
    requestMock: vi.fn(),
    refreshAccessTokenMock: vi.fn(),
    revokeTokenMock: vi.fn(),
    setCredentialsMock: vi.fn(),
  }));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(function OAuth2Client(this: object) {
    Object.assign(this, {
      generateAuthUrl: generateAuthUrlMock,
      getToken: getTokenMock,
      request: requestMock,
      refreshAccessToken: refreshAccessTokenMock,
      revokeToken: revokeTokenMock,
      setCredentials: setCredentialsMock,
    });
  }),
}));

const { getGoogleOauthAccountMock, updateGoogleOauthTokensMock } = vi.hoisted(() => ({
  getGoogleOauthAccountMock: vi.fn(),
  updateGoogleOauthTokensMock: vi.fn(),
}));

vi.mock("@/lib/repositories/google-oauth-repository", () => ({
  getGoogleOauthAccount: getGoogleOauthAccountMock,
  updateGoogleOauthTokens: updateGoogleOauthTokensMock,
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("isOauthConfigured", () => {
  it("true when both client id and secret are set", async () => {
    const { isOauthConfigured } = await import("./oauth");
    expect(isOauthConfigured()).toBe(true);
  });

  it("false when either is missing", async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const { isOauthConfigured } = await import("./oauth");
    expect(isOauthConfigured()).toBe(false);
  });
});

describe("buildAuthUrl", () => {
  it("requests the account chooser and a refresh token every time", async () => {
    generateAuthUrlMock.mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?...");
    const { buildAuthUrl } = await import("./oauth");

    const url = buildAuthUrl("https://app.example/callback", "state-123");

    expect(url).toBe("https://accounts.google.com/o/oauth2/v2/auth?...");
    expect(generateAuthUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "select_account consent", state: "state-123", access_type: "offline" })
    );
  });

  it("returns null when not configured", async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    const { buildAuthUrl } = await import("./oauth");
    expect(buildAuthUrl("https://app.example/callback", "state")).toBeNull();
  });
});

describe("exchangeCodeForAccount", () => {
  it("returns the connected account's email and tokens", async () => {
    getTokenMock.mockResolvedValue({
      tokens: { access_token: "at", refresh_token: "rt", scope: "s", expiry_date: Date.now() + 3600_000 },
    });
    requestMock.mockResolvedValue({ data: { email: "ana@gmail.com" } });
    const { exchangeCodeForAccount } = await import("./oauth");

    const account = await exchangeCodeForAccount("https://app.example/callback", "code-1");

    expect(account?.email).toBe("ana@gmail.com");
    expect(account?.accessToken).toBe("at");
    expect(account?.refreshToken).toBe("rt");
  });

  it("returns null when Google doesn't return an access token", async () => {
    getTokenMock.mockResolvedValue({ tokens: {} });
    const { exchangeCodeForAccount } = await import("./oauth");
    expect(await exchangeCodeForAccount("https://app.example/callback", "code-1")).toBeNull();
  });
});

describe("getOauthAccessToken", () => {
  it("returns the stored token without refreshing when it isn't near expiry", async () => {
    getGoogleOauthAccountMock.mockResolvedValue({
      staffId: "s1",
      email: "ana@gmail.com",
      accessToken: "at",
      refreshToken: "rt",
      scope: "s",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const { getOauthAccessToken } = await import("./oauth");

    const result = await getOauthAccessToken("s1");

    expect(result).toEqual({ token: "at", email: "ana@gmail.com" });
    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
  });

  it("refreshes and persists the token when it's near expiry", async () => {
    getGoogleOauthAccountMock.mockResolvedValue({
      staffId: "s1",
      email: "ana@gmail.com",
      accessToken: "old",
      refreshToken: "rt",
      scope: "s",
      expiresAt: new Date(Date.now() - 1000),
    });
    refreshAccessTokenMock.mockResolvedValue({
      credentials: { access_token: "new", expiry_date: Date.now() + 3600_000 },
    });
    const { getOauthAccessToken } = await import("./oauth");

    const result = await getOauthAccessToken("s1");

    expect(result).toEqual({ token: "new", email: "ana@gmail.com" });
    expect(updateGoogleOauthTokensMock).toHaveBeenCalledWith("s1", expect.objectContaining({ accessToken: "new" }));
  });

  it("returns null when nothing is connected", async () => {
    getGoogleOauthAccountMock.mockResolvedValue(null);
    const { getOauthAccessToken } = await import("./oauth");
    expect(await getOauthAccessToken("s1")).toBeNull();
  });

  it("returns null when not configured, without touching the DB", async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    const { getOauthAccessToken } = await import("./oauth");
    expect(await getOauthAccessToken("s1")).toBeNull();
    expect(getGoogleOauthAccountMock).not.toHaveBeenCalled();
  });
});

describe("calendar scope", () => {
  it("hasScope matches a whole scope in a space-separated list", async () => {
    const { hasScope, CALENDAR_SCOPE } = await import("@/lib/google/oauth");
    expect(hasScope(`openid ${CALENDAR_SCOPE} email`, CALENDAR_SCOPE)).toBe(true);
    expect(hasScope("openid email", CALENDAR_SCOPE)).toBe(false);
    expect(hasScope(null, CALENDAR_SCOPE)).toBe(false);
  });
});
