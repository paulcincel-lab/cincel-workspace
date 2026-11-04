import "server-only";

import { OAuth2Client } from "google-auth-library";

import {
  getGoogleOauthAccount,
  updateGoogleOauthTokens,
} from "@/lib/repositories/google-oauth-repository";

/*
 * Token refresh for the legacy `core.google_oauth_accounts` rows, plus the
 * shared Google scope helpers. The old "connect any Google account" flow is
 * gone: staff grant Drive and Calendar through sign-in consent
 * (lib/google/staff-oauth.ts). What's left is still used by the Calendar sync
 * and the picker until the delegation branch is removed.
 */

/**
 * Asked for only when someone turns on Google Calendar sync (#434), as an
 * incremental grant — Drive-only users are never asked for calendar access.
 */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

/** Whether a stored space-separated OAuth scope string includes `scope`. */
export function hasScope(granted: string | null | undefined, scope: string): boolean {
  return (granted ?? "").split(/\s+/).includes(scope);
}

function credentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isOauthConfigured(): boolean {
  return credentials() !== null;
}

function client(): OAuth2Client | null {
  const creds = credentials();
  if (!creds) return null;
  return new OAuth2Client({ clientId: creds.clientId, clientSecret: creds.clientSecret });
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

  const oauth2 = client();
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
