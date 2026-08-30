import "server-only";

import { JWT } from "google-auth-library";

/**
 * Google Drive access via a service account with domain-wide delegation —
 * impersonating the logged-in Cincel user, never a fixed identity.
 *
 * Cincel's Drive folders are shared with different permissions per person, so
 * a single shared identity would either over- or under-expose files relative
 * to what that person can actually see in Drive. Impersonating the caller
 * means Google's own per-file/per-folder permissions are enforced exactly as
 * they already are — this feature adds no new exposure.
 *
 * Configured through server-only env vars:
 *   GOOGLE_SA_CLIENT_EMAIL      – service account email
 *   GOOGLE_SA_PRIVATE_KEY       – PEM private key (literal \n allowed)
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID – folder the picker starts in
 *
 * The domain-wide delegation grant on the Workspace side must authorize only
 * `drive.readonly` for this service account — see docs/google-drive.md.
 */
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

// One JWT per impersonated user. A JWT instance refreshes its own access
// token internally, so caching the instance (not a token string) is safe and
// avoids re-signing a new assertion on every request.
const clientCache = new Map<string, JWT>();

function credentials(): { clientEmail: string; key: string } | null {
  const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY?.trim();
  if (!clientEmail || !rawKey) return null;
  return { clientEmail, key: rawKey.replace(/\\n/g, "\n") };
}

/**
 * A Drive client impersonating `userEmail` (the caller's institutional email,
 * which must match their real Workspace email for delegation to resolve).
 * Returns `null` when the service account isn't configured, or `userEmail` is
 * empty — every caller must degrade gracefully rather than throw.
 */
export function getDriveClientFor(userEmail: string): JWT | null {
  const trimmedEmail = userEmail?.trim();
  if (!trimmedEmail) return null;

  const creds = credentials();
  if (!creds) return null;

  const cached = clientCache.get(trimmedEmail);
  if (cached) return cached;

  const client = new JWT({
    email: creds.clientEmail,
    key: creds.key,
    scopes: SCOPES,
    subject: trimmedEmail,
  });
  clientCache.set(trimmedEmail, client);
  return client;
}

export function getDriveRootFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() || null;
}

/**
 * Static check: does this server have service-account credentials at all?
 * Independent of whether impersonating any specific user will succeed (that
 * depends on the Workspace delegation grant and each user's license) — used
 * to decide whether to show the picker UI at all.
 */
export function isDriveConfigured(): boolean {
  return credentials() !== null;
}
