import "server-only";

import { OAuth2Client } from "google-auth-library";

import {
  getGoogleOauthAccount,
  updateGoogleOauthTokens,
} from "@/lib/repositories/google-oauth-repository";

/**
 * Real "Sign in with Google" — a staff member picks and connects their own
 * Google account (any account, not only their institutional one), through
 * Google's real account chooser. Distinct from lib/google/client.ts, which
 * impersonates the caller's institutional email via a service account with
 * no account choice involved. When both are available, callers prefer this
 * one — see lib/google/drive-repository.ts.
 */
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly", "openid", "email"];

function credentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isOauthConfigured(): boolean {
  return credentials() !== null;
}

function client(redirectUri: string): OAuth2Client | null {
  const creds = credentials();
  if (!creds) return null;
  return new OAuth2Client({ clientId: creds.clientId, clientSecret: creds.clientSecret, redirectUri });
}

/**
 * The consent-screen URL. `prompt: "select_account consent"` forces Google's
 * account chooser to show every time (not just on first-ever connect) and
 * guarantees a refresh_token comes back, so reconnecting with a different
 * account always works cleanly.
 */
export function buildAuthUrl(redirectUri: string, state: string): string | null {
  const oauth2 = client(redirectUri);
  if (!oauth2) return null;
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "select_account consent",
    state,
  });
}

export async function exchangeCodeForAccount(
  redirectUri: string,
  code: string
): Promise<{ email: string; accessToken: string; refreshToken: string | null; scope: string; expiresAt: Date } | null> {
  const oauth2 = client(redirectUri);
  if (!oauth2) return null;

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.access_token) return null;

  oauth2.setCredentials(tokens);
  const { data } = await oauth2.request<{ email?: string }>({
    url: "https://www.googleapis.com/oauth2/v2/userinfo",
  });
  if (!data.email) return null;

  return {
    email: data.email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    scope: tokens.scope ?? SCOPES.join(" "),
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 55 * 60 * 1000),
  };
}

/**
 * An access token for `staffId`'s connected account, refreshing and
 * persisting it first if it's expired or about to. Returns `null` when
 * nothing is connected, OAuth isn't configured, or the refresh fails (e.g.
 * the account revoked access) — callers fall back to the service account.
 */
export async function getOauthAccessToken(staffId: string): Promise<{ token: string; email: string } | null> {
  if (!isOauthConfigured()) return null;

  const account = await getGoogleOauthAccount(staffId);
  if (!account) return null;

  const expiresSoon = account.expiresAt.getTime() - Date.now() < 60_000;
  if (!expiresSoon) {
    return { token: account.accessToken, email: account.email };
  }
  if (!account.refreshToken) return null;

  const oauth2 = client("");
  if (!oauth2) return null;
  oauth2.setCredentials({ refresh_token: account.refreshToken });

  try {
    const { credentials: refreshed } = await oauth2.refreshAccessToken();
    if (!refreshed.access_token) return null;
    const expiresAt = refreshed.expiry_date ? new Date(refreshed.expiry_date) : new Date(Date.now() + 55 * 60 * 1000);
    await updateGoogleOauthTokens(staffId, { accessToken: refreshed.access_token, expiresAt });
    return { token: refreshed.access_token, email: account.email };
  } catch {
    return null;
  }
}

/** Best-effort revoke with Google; the local row is deleted regardless of the outcome. */
export async function revokeOauthToken(accessToken: string): Promise<void> {
  const oauth2 = client("");
  try {
    await oauth2?.revokeToken(accessToken);
  } catch {
    // Already revoked/expired on Google's side — nothing more to do.
  }
}
