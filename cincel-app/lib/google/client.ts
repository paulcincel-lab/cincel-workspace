import "server-only";

import { JWT } from "google-auth-library";

/**
 * Google Drive access via a service account (no per-user OAuth).
 *
 * Configured through server-only env vars:
 *   GOOGLE_SA_CLIENT_EMAIL   – service account email
 *   GOOGLE_SA_PRIVATE_KEY    – PEM private key (literal \n allowed)
 *   GOOGLE_SA_SUBJECT        – optional user to impersonate (domain-wide delegation)
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID – folder the picker starts in
 *
 * Returns `null` when unconfigured so every caller can degrade gracefully.
 */
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

let cached: JWT | null | undefined;

export function getDriveClient(): JWT | null {
  if (cached !== undefined) return cached;

  const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY?.trim();
  const subject = process.env.GOOGLE_SA_SUBJECT?.trim() || undefined;

  if (!clientEmail || !rawKey) {
    cached = null;
    return null;
  }

  cached = new JWT({
    email: clientEmail,
    key: rawKey.replace(/\\n/g, "\n"),
    scopes: SCOPES,
    subject,
  });
  return cached;
}

export function getDriveRootFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() || null;
}

export function isDriveConfigured(): boolean {
  return getDriveClient() !== null;
}
