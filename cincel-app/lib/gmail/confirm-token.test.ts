// @vitest-environment node
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CONFIRM_TOKEN_TTL_MS,
  confirmTokenSecret,
  issueConfirmToken,
  verifyConfirmToken,
} from "./confirm-token";

const SECRET = "s3cret";
const T0 = Date.UTC(2026, 10, 7, 10, 0, 0);

describe("confirm token", () => {
  it("is base64url(HMAC_SHA256(secret, staffId|draftId|issuedAt))|issuedAt, valid 10 minutes", () => {
    const { confirmToken, expiresAt } = issueConfirmToken(SECRET, "staff-1", "d1", T0);
    const expected = createHmac("sha256", SECRET).update(`staff-1|d1|${T0}`).digest("base64url");
    expect(confirmToken).toBe(`${expected}|${T0}`);
    expect(expiresAt.getTime()).toBe(T0 + CONFIRM_TOKEN_TTL_MS);
  });

  it("verifies for the same staff member and draft within 10 minutes", () => {
    const { confirmToken } = issueConfirmToken(SECRET, "staff-1", "d1", T0);
    expect(() => verifyConfirmToken(SECRET, "staff-1", "d1", confirmToken, T0 + CONFIRM_TOKEN_TTL_MS)).not.toThrow();
  });

  it("CONFIRM_REQUIRED when missing, malformed or for another owner, draft or secret", () => {
    const { confirmToken } = issueConfirmToken(SECRET, "staff-1", "d1", T0);
    for (const token of [undefined, null, "", "abc", "|123", `${confirmToken}x`, confirmToken.replace(/^./, "A")]) {
      expect(() => verifyConfirmToken(SECRET, "staff-1", "d1", token, T0)).toThrow(/^CONFIRM_REQUIRED$/);
    }
    expect(() => verifyConfirmToken(SECRET, "staff-2", "d1", confirmToken, T0)).toThrow(/^CONFIRM_REQUIRED$/);
    expect(() => verifyConfirmToken(SECRET, "staff-1", "d2", confirmToken, T0)).toThrow(/^CONFIRM_REQUIRED$/);
    expect(() => verifyConfirmToken("other", "staff-1", "d1", confirmToken, T0)).toThrow(/^CONFIRM_REQUIRED$/);
  });

  it("CONFIRM_REQUIRED when issuedAt is edited, even to a fresher time", () => {
    const { confirmToken } = issueConfirmToken(SECRET, "staff-1", "d1", T0);
    const forged = `${confirmToken.split("|")[0]}|${T0 + 60_000}`;
    expect(() => verifyConfirmToken(SECRET, "staff-1", "d1", forged, T0 + 60_000)).toThrow(/^CONFIRM_REQUIRED$/);
  });

  it("EXPIRED after 10 minutes", () => {
    const { confirmToken } = issueConfirmToken(SECRET, "staff-1", "d1", T0);
    expect(() => verifyConfirmToken(SECRET, "staff-1", "d1", confirmToken, T0 + CONFIRM_TOKEN_TTL_MS + 1)).toThrow(
      /^EXPIRED$/,
    );
  });

  it("reads SESSION_SECRET and refuses to sign without it", () => {
    expect(confirmTokenSecret({ SESSION_SECRET: " abc " })).toBe("abc");
    expect(() => confirmTokenSecret({})).toThrow(/SESSION_SECRET/);
  });
});
