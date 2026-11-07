/**
 * Send confirmation token of a Gmail draft (redesign BE §8.6):
 * `base64url(HMAC_SHA256(SESSION_SECRET, staffId|draftId|issuedAt))|issuedAt`
 * (`issuedAt` in epoch milliseconds), valid 10 minutes. Pure apart from the
 * secret lookup.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const CONFIRM_TOKEN_TTL_MS = 10 * 60 * 1000;

/** Clock skew tolerated for a token issued "in the future" by another app instance. */
const FUTURE_SKEW_MS = 60 * 1000;

export function confirmTokenSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

function sign(secret: string, staffId: string, draftId: string, issuedAt: number): string {
  return createHmac("sha256", secret).update(`${staffId}|${draftId}|${issuedAt}`).digest("base64url");
}

export function issueConfirmToken(
  secret: string,
  staffId: string,
  draftId: string,
  issuedAt: number = Date.now(),
): { confirmToken: string; expiresAt: Date } {
  return {
    confirmToken: `${sign(secret, staffId, draftId, issuedAt)}|${issuedAt}`,
    expiresAt: new Date(issuedAt + CONFIRM_TOKEN_TTL_MS),
  };
}

/**
 * Throws `CONFIRM_REQUIRED` when the token is missing, malformed or not for
 * this staff member and draft, `EXPIRED` when it is older than 10 minutes.
 */
export function verifyConfirmToken(
  secret: string,
  staffId: string,
  draftId: string,
  token: string | null | undefined,
  now: number = Date.now(),
): void {
  if (!token) throw new Error("CONFIRM_REQUIRED");
  const sep = token.lastIndexOf("|");
  if (sep <= 0) throw new Error("CONFIRM_REQUIRED");
  const signature = token.slice(0, sep);
  const issuedRaw = token.slice(sep + 1);
  if (!/^\d{1,16}$/.test(issuedRaw)) throw new Error("CONFIRM_REQUIRED");
  const issuedAt = Number(issuedRaw);

  const expected = Buffer.from(sign(secret, staffId, draftId, issuedAt));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error("CONFIRM_REQUIRED");

  if (issuedAt > now + FUTURE_SKEW_MS) throw new Error("CONFIRM_REQUIRED");
  if (now - issuedAt > CONFIRM_TOKEN_TTL_MS) throw new Error("EXPIRED");
}
