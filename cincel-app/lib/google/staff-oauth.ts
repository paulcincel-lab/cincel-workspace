import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";

import { getAppOrigin, safeReturnTo } from "@/lib/auth/safe-return-to";
import { CALENDAR_SCOPE } from "@/lib/google/oauth";

/**
 * Staff "Entrar con Google" (backend spec §A.4, §A.10): the auth URL with
 * state + PKCE kept in a short-lived httpOnly cookie, the code exchange, ID
 * token verification with `hd` and `email_verified` enforced server side,
 * and token refresh. Used by `/api/auth/google/start` and `/callback`.
 *
 * Configured through server-only env vars:
 *   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET – staff OAuth client (Internal)
 *   APP_ORIGIN               – builds the redirect URI, never the request host
 *   GOOGLE_WORKSPACE_DOMAIN  – the only accepted `hd`
 */

type Env = Record<string, string | undefined>;

export const STAFF_OAUTH_CALLBACK_PATH = "/api/auth/google/callback";

/** Cookie holding state, PKCE verifier and return target between start and callback. */
export const STAFF_OAUTH_COOKIE = "cincel_google_oauth";
export const STAFF_OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

export const STAFF_SIGN_IN_SCOPES = ["openid", "email", "profile"];
export const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

/** Incremental grants (§A.6.2), the `scope` query value of `/api/auth/google/start`. */
export const STAFF_OAUTH_EXTRA_SCOPES = {
  drive: DRIVE_READONLY_SCOPE,
  calendar: CALENDAR_SCOPE,
} as const;

export type StaffOauthScope = keyof typeof STAFF_OAUTH_EXTRA_SCOPES;

export function parseStaffOauthScope(value: unknown): StaffOauthScope | null {
  return value === "drive" || value === "calendar" ? value : null;
}

export type StaffOauthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  workspaceDomain: string;
};

/** The staff OAuth config, or null when any required env var is missing. */
export function staffOauthConfig(env: Env = process.env): StaffOauthConfig | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const workspaceDomain = env.GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase();
  const origin = getAppOrigin(env);
  if (!clientId || !clientSecret || !workspaceDomain || !origin) return null;
  return {
    clientId,
    clientSecret,
    workspaceDomain,
    redirectUri: `${origin}${STAFF_OAUTH_CALLBACK_PATH}`,
  };
}

export class StaffOauthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffOauthError";
  }
}

/** Refresh refused by Google (`invalid_grant`): the grant is gone; clear the stored tokens. */
export class StaffOauthInvalidGrantError extends StaffOauthError {
  constructor() {
    super("Google rechazó el refresh token (invalid_grant)");
    this.name = "StaffOauthInvalidGrantError";
  }
}

function requireConfig(env: Env): StaffOauthConfig {
  const config = staffOauthConfig(env);
  if (!config) throw new StaffOauthError("El inicio de sesión con Google no está configurado");
  return config;
}

function oauthClient(config: StaffOauthConfig): OAuth2Client {
  return new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });
}

// ---------------------------------------------------------------------------
// State + PKCE cookie
// ---------------------------------------------------------------------------

/** What the start route stores in the cookie and the callback reads back. */
export type StaffOauthState = {
  state: string;
  codeVerifier: string;
  /** Already passed through `safeReturnTo()`. */
  returnTo: string;
  scope: StaffOauthScope | null;
  /** Epoch ms. */
  issuedAt: number;
};

export type StaffOauthCookie = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
};

function cookieOptions(env: Env, maxAge: number): StaffOauthCookie["options"] {
  // `lax` so the cookie comes back on Google's top-level redirect to the callback.
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

function encodeState(value: StaffOauthState): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeState(raw: string): StaffOauthState | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const v = parsed as Record<string, unknown>;
    if (typeof v.state !== "string" || v.state === "") return null;
    if (typeof v.codeVerifier !== "string" || v.codeVerifier === "") return null;
    if (typeof v.returnTo !== "string") return null;
    if (typeof v.issuedAt !== "number" || !Number.isFinite(v.issuedAt)) return null;
    if (v.scope !== null && parseStaffOauthScope(v.scope) === null) return null;
    return {
      state: v.state,
      codeVerifier: v.codeVerifier,
      returnTo: v.returnTo,
      scope: (v.scope as StaffOauthScope | null) ?? null,
      issuedAt: v.issuedAt,
    };
  } catch {
    return null;
  }
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** PKCE S256: a 43-char base64url verifier and its SHA-256 challenge. */
export function createPkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

/** Cookie that clears the state cookie; the callback sends it on every outcome. */
export function clearStaffOauthCookie(env: Env = process.env): StaffOauthCookie {
  return {
    name: STAFF_OAUTH_COOKIE,
    value: "",
    options: cookieOptions(env, 0),
  };
}

/**
 * The callback's state check: the cookie must parse, be under 10 minutes old
 * and carry the same `state` as the query. Returns the stored values (the
 * PKCE verifier for the exchange, the return target) or null on any mismatch,
 * which the callback sends to `/login?error=state`.
 */
export function verifyStaffOauthState(
  cookieValue: string | null | undefined,
  stateParam: string | null | undefined,
  now: number = Date.now(),
): StaffOauthState | null {
  if (!cookieValue || !stateParam) return null;
  const stored = decodeState(cookieValue);
  if (!stored) return null;
  const age = now - stored.issuedAt;
  if (age < 0 || age > STAFF_OAUTH_COOKIE_MAX_AGE_SECONDS * 1000) return null;
  if (!sameSecret(stored.state, stateParam)) return null;
  return stored;
}

// ---------------------------------------------------------------------------
// Auth URL
// ---------------------------------------------------------------------------

export type StartStaffOauthOptions = {
  /** Raw `return_to`; validated here with `safeReturnTo()`. */
  returnTo?: string | null;
  /** Incremental grant on top of sign-in (§A.6.2); null for plain sign-in. */
  scope?: StaffOauthScope | null;
  /** The signed-in staff email, for incremental grants. */
  loginHint?: string | null;
};

/**
 * The Google auth URL and the state cookie to set alongside the redirect.
 *
 * Sign-in asks for `openid email profile` with `hd`, `prompt=select_account`.
 * An incremental grant (`scope`) adds Drive or Calendar with `prompt=consent`
 * and `login_hint`. Both use `include_granted_scopes` so the stored scope
 * keeps earlier grants, and `access_type=offline` for a refresh token.
 */
export function startStaffOauth(
  options: StartStaffOauthOptions = {},
  env: Env = process.env,
  now: number = Date.now(),
): { url: string; cookie: StaffOauthCookie } {
  const config = requireConfig(env);
  const scope = options.scope ?? null;
  const state = randomBytes(24).toString("base64url");
  const { codeVerifier, codeChallenge } = createPkcePair();

  const url = oauthClient(config).generateAuthUrl({
    scope: scope ? [...STAFF_SIGN_IN_SCOPES, STAFF_OAUTH_EXTRA_SCOPES[scope]] : STAFF_SIGN_IN_SCOPES,
    access_type: "offline",
    include_granted_scopes: true,
    prompt: scope ? "consent" : "select_account",
    ...(scope && options.loginHint ? { login_hint: options.loginHint } : {}),
    hd: config.workspaceDomain,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });

  const value = encodeState({
    state,
    codeVerifier,
    returnTo: safeReturnTo(options.returnTo, undefined, env),
    scope,
    issuedAt: now,
  });

  return {
    url,
    cookie: {
      name: STAFF_OAUTH_COOKIE,
      value,
      options: cookieOptions(env, STAFF_OAUTH_COOKIE_MAX_AGE_SECONDS),
    },
  };
}

// ---------------------------------------------------------------------------
// Code exchange and ID token
// ---------------------------------------------------------------------------

export type StaffIdentity = {
  sub: string;
  /** Lowercase. */
  email: string;
  name: string | null;
  hd: string;
};

export type StaffTokens = {
  accessToken: string;
  refreshToken: string | null;
  /** Space-separated granted scopes. */
  scope: string;
  expiresAt: Date;
};

export type IdTokenCheck =
  | { ok: true; identity: StaffIdentity }
  /** `domain` is the shared denial reason (§A.4); `detail` is for the log only. */
  | {
      ok: false;
      reason: "domain";
      detail: "hd_mismatch" | "email_unverified" | "missing_claims";
    };

type IdTokenClaims = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  hd?: string;
  name?: string;
};

/**
 * Claim checks after the signature/audience check: `hd` must equal the
 * Workspace domain (the `hd` URL parameter alone proves nothing) and the
 * email must be verified.
 */
export function checkStaffIdTokenClaims(claims: IdTokenClaims, workspaceDomain: string): IdTokenCheck {
  if (!claims.sub || !claims.email) return { ok: false, reason: "domain", detail: "missing_claims" };
  if (!claims.hd || claims.hd.toLowerCase() !== workspaceDomain.toLowerCase()) {
    return { ok: false, reason: "domain", detail: "hd_mismatch" };
  }
  if (claims.email_verified !== true) return { ok: false, reason: "domain", detail: "email_unverified" };
  return {
    ok: true,
    identity: {
      sub: claims.sub,
      email: claims.email.toLowerCase(),
      name: claims.name?.trim() || null,
      hd: claims.hd.toLowerCase(),
    },
  };
}

/**
 * Verifies the ID token's signature, audience (our client ID) and expiry with
 * `OAuth2Client.verifyIdToken`, then the claims. Throws `StaffOauthError`
 * when the token itself is invalid.
 */
export async function verifyStaffIdToken(idToken: string, env: Env = process.env): Promise<IdTokenCheck> {
  const config = requireConfig(env);
  let claims: IdTokenClaims | undefined;
  try {
    const ticket = await oauthClient(config).verifyIdToken({
      idToken,
      audience: config.clientId,
    });
    claims = ticket.getPayload();
  } catch {
    throw new StaffOauthError("El ID token de Google no es válido");
  }
  if (!claims) throw new StaffOauthError("El ID token de Google no tiene payload");
  return checkStaffIdTokenClaims(claims, config.workspaceDomain);
}

function expiresAtFrom(expiryDate: number | null | undefined): Date {
  return expiryDate ? new Date(expiryDate) : new Date(Date.now() + 55 * 60 * 1000);
}

/**
 * Exchanges the callback `code` (with the PKCE verifier from the cookie) and
 * verifies the returned ID token. Throws `StaffOauthError` when Google
 * returns no ID/access token or the token is invalid.
 */
export async function exchangeStaffCode(
  code: string,
  codeVerifier: string,
  env: Env = process.env,
): Promise<{ check: IdTokenCheck; tokens: StaffTokens }> {
  const config = requireConfig(env);
  let tokens;
  try {
    ({ tokens } = await oauthClient(config).getToken({
      code,
      codeVerifier,
      redirect_uri: config.redirectUri,
    }));
  } catch {
    throw new StaffOauthError("No se pudo canjear el código de Google");
  }
  if (!tokens.id_token || !tokens.access_token) throw new StaffOauthError("Google no devolvió los tokens esperados");

  const check = await verifyStaffIdToken(tokens.id_token, env);
  return {
    check,
    tokens: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      scope: tokens.scope ?? STAFF_SIGN_IN_SCOPES.join(" "),
      expiresAt: expiresAtFrom(tokens.expiry_date),
    },
  };
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

function isInvalidGrant(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    message?: unknown;
    response?: { data?: { error?: unknown } };
  };
  return e.response?.data?.error === "invalid_grant" || e.message === "invalid_grant";
}

/**
 * A fresh access token for a stored refresh token. Throws
 * `StaffOauthInvalidGrantError` on `invalid_grant` (§A.6.2: clear tokens and
 * scope), `StaffOauthError` on any other failure.
 */
export async function refreshStaffAccessToken(
  refreshToken: string,
  env: Env = process.env,
): Promise<{ accessToken: string; expiresAt: Date; scope: string | null }> {
  const client = oauthClient(requireConfig(env));
  client.setCredentials({ refresh_token: refreshToken });
  let refreshed;
  try {
    ({ credentials: refreshed } = await client.refreshAccessToken());
  } catch (error) {
    if (isInvalidGrant(error)) throw new StaffOauthInvalidGrantError();
    throw new StaffOauthError("No se pudo renovar el token de Google");
  }
  if (!refreshed.access_token) throw new StaffOauthError("Google no devolvió un access token");
  return {
    accessToken: refreshed.access_token,
    expiresAt: expiresAtFrom(refreshed.expiry_date),
    scope: refreshed.scope ?? null,
  };
}
