// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { assertGmailAccess, gmailAccessFrom } from "./access";
import type { GmailAccountState } from "./accounts";

const READ = "https://www.googleapis.com/auth/gmail.readonly";
const COMPOSE = "https://www.googleapis.com/auth/gmail.compose";
const MODIFY = "https://www.googleapis.com/auth/gmail.modify";

const account = (disconnectedAt: Date | null = null) => ({ staffId: "s1", disconnectedAt }) as GmailAccountState;

describe("gmailAccessFrom", () => {
  it("connected with both scopes and a live sync row", () => {
    expect(gmailAccessFrom(`openid ${READ} ${COMPOSE}`, account())).toMatchObject({
      connected: true,
      canRead: true,
      canCompose: true,
      canModify: false,
      scopeOk: true,
    });
  });

  it("not connected without a token, without Gmail scopes, without a sync row or after a disconnect", () => {
    expect(gmailAccessFrom(null, account()).connected).toBe(false);
    expect(gmailAccessFrom("openid email", account()).connected).toBe(false);
    expect(gmailAccessFrom(`${READ} ${COMPOSE}`, null).connected).toBe(false);
    expect(gmailAccessFrom(`${READ} ${COMPOSE}`, account(new Date())).connected).toBe(false);
  });

  it("gmail.modify allows reading and label changes", () => {
    expect(gmailAccessFrom(MODIFY, account())).toMatchObject({ connected: true, canRead: true, canModify: true });
  });
});

describe("assertGmailAccess", () => {
  it("NOT_CONNECTED before SCOPE_MISSING", () => {
    expect(() => assertGmailAccess(gmailAccessFrom(null, null), { read: true })).toThrow(/^NOT_CONNECTED$/);
    expect(() => assertGmailAccess(gmailAccessFrom(COMPOSE, account()), { read: true })).toThrow(/^SCOPE_MISSING$/);
    expect(() => assertGmailAccess(gmailAccessFrom(READ, account()), { compose: true })).toThrow(/^SCOPE_MISSING$/);
    expect(() => assertGmailAccess(gmailAccessFrom(`${READ} ${COMPOSE}`, account()), { read: true, compose: true })).not.toThrow();
  });
});
