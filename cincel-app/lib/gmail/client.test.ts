// @vitest-environment node
/**
 * Gmail client (redesign BE §8.6) with a mocked `fetch`: one refresh on 401,
 * `invalid_grant` → NOT_CONNECTED, 403 scope → SCOPE_MISSING, 429/5xx →
 * RATE_LIMITED with the backoff, and the request shapes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accounts = vi.hoisted(() => ({
  findGmailAccountState: vi.fn(),
  grantedGoogleScope: vi.fn(),
  recordGmailError: vi.fn(),
  applyGmailBackoff: vi.fn(),
}));
const tokenStore = vi.hoisted(() => ({ getStaffAccessToken: vi.fn() }));
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ db: { app: true } }));
vi.mock("@/lib/gmail/accounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gmail/accounts")>()),
  ...accounts,
}));
vi.mock("@/lib/google/staff-token", () => tokenStore);
vi.mock("@/lib/google/staff-oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/staff-oauth")>()),
  refreshStaffAccessToken: refreshMock,
}));

import { StaffOauthInvalidGrantError } from "@/lib/google/staff-oauth";

import { GmailError, gmailClient, staffGmailTokenSource } from "./client";

const STAFF = "staff-1";
const testDb = { test: true } as never;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fetchSequence(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  return fn;
}

beforeEach(() => {
  accounts.findGmailAccountState.mockResolvedValue({ staffId: STAFF, disconnectedAt: null, lastError: null });
  accounts.applyGmailBackoff.mockResolvedValue(new Date());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("gmailClient: connection checks", () => {
  it("refuses a missing or disconnected account before any Gmail call", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const token = vi.fn().mockResolvedValue("t");
    accounts.findGmailAccountState.mockResolvedValueOnce(null);
    await expect(gmailClient(STAFF, { fetch: fetchMock, token, db: testDb })).rejects.toMatchObject({
      code: "NOT_CONNECTED",
    });
    accounts.findGmailAccountState.mockResolvedValueOnce({ staffId: STAFF, disconnectedAt: new Date() });
    await expect(gmailClient(STAFF, { fetch: fetchMock, token, db: testDb })).rejects.toMatchObject({
      code: "NOT_CONNECTED",
    });
    expect(token).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls users/me with the staff member's bearer token", async () => {
    const fetchMock = fetchSequence(json(200, { threads: [{ id: "t1" }] }));
    const api = await gmailClient(STAFF, { fetch: fetchMock, token: async () => "tok-1", db: testDb });
    await expect(api.listThreads({ q: "in:inbox" })).resolves.toEqual({ threads: [{ id: "t1" }] });
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe("https://gmail.googleapis.com/gmail/v1/users/me/threads");
    expect(parsed.searchParams.get("q")).toBe("in:inbox");
    expect(parsed.searchParams.get("maxResults")).toBe("50");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
  });
});

describe("gmailClient: 401", () => {
  it("refreshes exactly once and retries with the new token", async () => {
    const fetchMock = fetchSequence(json(401, {}), json(200, { id: "t1", messages: [] }));
    const token = vi.fn(async (_staff: string, force: boolean) => (force ? "fresh" : "stale"));
    const api = await gmailClient(STAFF, { fetch: fetchMock, token, db: testDb });
    await expect(api.getThread("t1", "metadata")).resolves.toEqual({ id: "t1", messages: [] });
    expect(token).toHaveBeenCalledTimes(2);
    expect(token).toHaveBeenLastCalledWith(STAFF, true);
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe("Bearer fresh");
  });

  it("a second 401 is NOT_CONNECTED without another refresh", async () => {
    const fetchMock = fetchSequence(json(401, {}), json(401, {}));
    const token = vi.fn().mockResolvedValue("tok");
    const api = await gmailClient(STAFF, { fetch: fetchMock, token, db: testDb });
    await expect(api.markThreadRead("t1")).rejects.toMatchObject({ code: "NOT_CONNECTED" });
    expect(token).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("gmailClient: 403 and backoff", () => {
  it("403 insufficient scope → SCOPE_MISSING and the mark", async () => {
    const fetchMock = fetchSequence(
      json(403, { error: { code: 403, status: "PERMISSION_DENIED", errors: [{ reason: "insufficientPermissions" }] } }),
    );
    const api = await gmailClient(STAFF, { fetch: fetchMock, token: async () => "t", db: testDb });
    await expect(api.getThread("t1", "full")).rejects.toMatchObject({ code: "SCOPE_MISSING" });
    expect(accounts.recordGmailError).toHaveBeenCalledWith(testDb, STAFF, "scope_missing");
    expect(accounts.applyGmailBackoff).not.toHaveBeenCalled();
  });

  it.each([429, 500, 503])("%i → RATE_LIMITED and the backoff", async (status) => {
    const now = new Date("2026-11-07T10:00:00Z");
    const fetchMock = fetchSequence(json(status, { error: { code: status } }));
    const api = await gmailClient(STAFF, { fetch: fetchMock, token: async () => "t", now: () => now, db: testDb });
    await expect(api.listHistory("100")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(accounts.applyGmailBackoff).toHaveBeenCalledWith(testDb, STAFF, now);
  });

  it("403 rate limit reasons are RATE_LIMITED too", async () => {
    const fetchMock = fetchSequence(json(403, { error: { errors: [{ reason: "userRateLimitExceeded" }] } }));
    const api = await gmailClient(STAFF, { fetch: fetchMock, token: async () => "t", db: testDb });
    await expect(api.getThread("t1", "full")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("404 → NOT_FOUND (an unknown or foreign draft)", async () => {
    const fetchMock = fetchSequence(json(404, { error: { code: 404 } }));
    const api = await gmailClient(STAFF, { fetch: fetchMock, token: async () => "t", db: testDb });
    const err = await api.updateDraft("d-other", "raw").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GmailError);
    expect(err).toMatchObject({ code: "NOT_FOUND", message: "NOT_FOUND" });
  });
});

describe("gmailClient: calls", () => {
  it("history.list asks for the three history types and merges pages", async () => {
    const fetchMock = fetchSequence(
      json(200, { history: [{ id: "1" }], nextPageToken: "p2", historyId: "5" }),
      json(200, { history: [{ id: "2" }], historyId: "9" }),
    );
    const api = await gmailClient(STAFF, { fetch: fetchMock, token: async () => "t", db: testDb });
    await expect(api.listHistory("100")).resolves.toEqual({ history: [{ id: "1" }, { id: "2" }], historyId: "9" });
    const first = new URL(String(fetchMock.mock.calls[0][0]));
    expect(first.searchParams.get("startHistoryId")).toBe("100");
    expect(first.searchParams.getAll("historyTypes")).toEqual(["messageAdded", "labelAdded", "labelRemoved"]);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("pageToken")).toBe("p2");
  });

  it("drafts: create, update in place, send", async () => {
    const fetchMock = fetchSequence(json(200, { id: "d1" }), json(200, { id: "d1" }), json(200, { id: "m1" }));
    const api = await gmailClient(STAFF, { fetch: fetchMock, token: async () => "t", db: testDb });
    await expect(api.createDraft("cmF3", "th1")).resolves.toEqual({ id: "d1" });
    await expect(api.updateDraft("d1", "cmF3Mg")).resolves.toEqual({ id: "d1" });
    await expect(api.sendDraft("d1")).resolves.toEqual({ messageId: "m1" });

    const [createUrl, createInit] = fetchMock.mock.calls[0];
    expect(String(createUrl)).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    expect(JSON.parse(String(createInit?.body))).toEqual({ message: { raw: "cmF3", threadId: "th1" } });
    const [updateUrl, updateInit] = fetchMock.mock.calls[1];
    expect(String(updateUrl)).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts/d1");
    expect(updateInit?.method).toBe("PUT");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ id: "d1" });
  });

  it("threads.modify removes UNREAD; attachments decode base64url", async () => {
    const fetchMock = fetchSequence(json(200, {}), json(200, { size: 5, data: Buffer.from("hello").toString("base64url") }));
    const api = await gmailClient(STAFF, { fetch: fetchMock, token: async () => "t", db: testDb });
    await api.markThreadRead("t1");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ removeLabelIds: ["UNREAD"] });
    const att = await api.getAttachment("m1", "a1");
    expect(att.data.toString()).toBe("hello");
    expect(att.size).toBe(5);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/m1/attachments/a1",
    );
  });
});

describe("staffGmailTokenSource", () => {
  it("returns the stored token", async () => {
    tokenStore.getStaffAccessToken.mockResolvedValue({ status: "ok", accessToken: "tok" });
    await expect(staffGmailTokenSource(testDb)(STAFF, false)).resolves.toBe("tok");
    expect(tokenStore.getStaffAccessToken).toHaveBeenCalledWith(STAFF, "gmail", expect.any(Object));
  });

  it("a forced refresh makes the token look expired", async () => {
    tokenStore.getStaffAccessToken.mockResolvedValue({ status: "ok", accessToken: "tok" });
    await staffGmailTokenSource(testDb)(STAFF, true);
    const deps = tokenStore.getStaffAccessToken.mock.calls[0][2] as { now?: () => number };
    expect(deps.now?.()).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("invalid_grant on refresh → NOT_CONNECTED and last_error = 'invalid_grant'", async () => {
    refreshMock.mockRejectedValue(new StaffOauthInvalidGrantError());
    tokenStore.getStaffAccessToken.mockImplementation(
      async (_id: string, _scope: string, deps: { refresh: (rt: string) => Promise<unknown> }) => {
        await deps.refresh("rt").catch(() => undefined);
        return { status: "needs_consent" };
      },
    );
    await expect(staffGmailTokenSource(testDb)(STAFF, true)).rejects.toMatchObject({ code: "NOT_CONNECTED" });
    expect(accounts.recordGmailError).toHaveBeenCalledWith(testDb, STAFF, "invalid_grant");
    expect(accounts.grantedGoogleScope).not.toHaveBeenCalled();
  });

  it("a grant without the Gmail scopes → SCOPE_MISSING", async () => {
    tokenStore.getStaffAccessToken.mockResolvedValue({ status: "needs_consent" });
    accounts.grantedGoogleScope.mockResolvedValue("openid email https://www.googleapis.com/auth/drive.readonly");
    await expect(staffGmailTokenSource(testDb)(STAFF, false)).rejects.toMatchObject({ code: "SCOPE_MISSING" });
    expect(accounts.recordGmailError).toHaveBeenCalledWith(testDb, STAFF, "scope_missing");
  });

  it("no token at all → NOT_CONNECTED", async () => {
    tokenStore.getStaffAccessToken.mockResolvedValue({ status: "needs_consent" });
    accounts.grantedGoogleScope.mockResolvedValue(null);
    await expect(staffGmailTokenSource(testDb)(STAFF, false)).rejects.toMatchObject({ code: "NOT_CONNECTED" });
    expect(accounts.recordGmailError).toHaveBeenCalledWith(testDb, STAFF, "not_connected");
  });
});

describe("backoff formula", async () => {
  const { gmailBackoffMinutes, previousBackoffAttempt } =
    await vi.importActual<typeof import("@/lib/gmail/accounts")>("@/lib/gmail/accounts");

  it("is min(2^n, 60) minutes", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(gmailBackoffMinutes)).toEqual([1, 2, 4, 8, 16, 32, 60, 60, 60]);
  });

  it("reads the previous attempt from last_error", () => {
    expect(previousBackoffAttempt(null)).toBe(-1);
    expect(previousBackoffAttempt("invalid_grant")).toBe(-1);
    expect(previousBackoffAttempt("rate_limited:3")).toBe(3);
  });
});
