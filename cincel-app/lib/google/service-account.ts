import { JWT } from "google-auth-library";

import { FAKE_ACCESS_TOKEN, isGoogleFake } from "./fake";

/**
 * The `cincel-directory` service account acting as itself: no `subject`, no
 * domain-wide delegation. It reads the Directory API through a custom
 * read-only admin role and uses Drive as a member of the Shared Drive. Each
 * client asks only for the scopes it needs.
 *
 * Configured through server-only env vars:
 *   GOOGLE_SA_CLIENT_EMAIL – service account email
 *   GOOGLE_SA_PRIVATE_KEY  – PEM private key (literal \n allowed)
 *
 * No `server-only` import: `drive-admin.ts` (also used by the monday CLI)
 * builds its JWT here.
 */

export const DIRECTORY_GROUP_MEMBER_SCOPE = "https://www.googleapis.com/auth/admin.directory.group.member.readonly";
export const DIRECTORY_USER_SCOPE = "https://www.googleapis.com/auth/admin.directory.user.readonly";
export const DIRECTORY_SCOPES = [DIRECTORY_GROUP_MEMBER_SCOPE, DIRECTORY_USER_SCOPE];

export type ServiceAccountCredentials = {
  clientEmail: string;
  /** PEM key; a literal `\n` (as stored in env files) is turned into a newline. */
  privateKey: string;
};

export type AccessTokenSource = () => Promise<string>;

type Env = Record<string, string | undefined>;

/** Credentials from `GOOGLE_SA_CLIENT_EMAIL` / `GOOGLE_SA_PRIVATE_KEY`, or null when either is missing. */
export function serviceAccountCredentialsFromEnv(env: Env = process.env): ServiceAccountCredentials | null {
  const clientEmail = env.GOOGLE_SA_CLIENT_EMAIL?.trim();
  const privateKey = env.GOOGLE_SA_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey };
}

/** A JWT client for the service account itself (never a `subject`). */
export function createServiceAccountJwt(credentials: ServiceAccountCredentials, scopes: string[]): JWT {
  return new JWT({
    email: credentials.clientEmail.trim(),
    key: credentials.privateKey.replace(/\\n/g, "\n"),
    scopes,
  });
}

/** Bearer tokens from a service account JWT; throws when Google returns none. */
export function createServiceAccountTokenSource(
  credentials: ServiceAccountCredentials,
  scopes: string[],
): AccessTokenSource {
  const jwt = createServiceAccountJwt(credentials, scopes);
  return async () => {
    const { token } = await jwt.getAccessToken();
    if (!token) throw new Error("No se obtuvo un token de la cuenta de servicio");
    return token;
  };
}

// One JWT per scope set. A JWT refreshes its own token, so caching the
// instance avoids signing a new assertion on every request.
const tokenSourceCache = new Map<string, AccessTokenSource>();

/**
 * Token source for the env-configured service account with `scopes`. With
 * `GOOGLE_FAKE=1` it returns a fixed fake token. Returns null when the service
 * account isn't configured; callers degrade instead of throwing.
 */
export function getServiceAccountTokenSource(scopes: string[], env: Env = process.env): AccessTokenSource | null {
  if (isGoogleFake(env)) return async () => FAKE_ACCESS_TOKEN;

  const credentials = serviceAccountCredentialsFromEnv(env);
  if (!credentials) return null;

  const key = `${credentials.clientEmail}|${[...scopes].sort().join(" ")}`;
  let source = tokenSourceCache.get(key);
  if (!source) {
    source = createServiceAccountTokenSource(credentials, scopes);
    tokenSourceCache.set(key, source);
  }
  return source;
}
