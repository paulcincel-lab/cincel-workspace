/**
 * Gmail REST wrapper (redesign BE §8.6) over
 * `https://gmail.googleapis.com/gmail/v1/users/me/*`, using the staff token
 * from `google_oauth_accounts` (refresh via `lib/google/staff-token.ts`). 401 →
 * refresh once; `invalid_grant` → `NOT_CONNECTED` (and
 * `gmail_accounts.last_error = 'invalid_grant'`); 403 scope → `SCOPE_MISSING`;
 * 429 / 5xx → `RATE_LIMITED` with `next_sync_after = now + min(2^n min, 60 min)`.
 *
 * A client is bound to one staff member: it only ever reads that person's own
 * mailbox (`users/me` with their own token).
 */
import "server-only";

import { db as appDb } from "@/lib/db/client";
import {
  applyGmailBackoff,
  findGmailAccountState,
  GMAIL_ERROR_INVALID_GRANT,
  GMAIL_ERROR_NOT_CONNECTED,
  GMAIL_ERROR_SCOPE_MISSING,
  grantedGoogleScope,
  recordGmailError,
} from "@/lib/gmail/accounts";
import { hasGrantedScope, refreshStaffAccessToken, StaffOauthInvalidGrantError } from "@/lib/google/staff-oauth";
import { getStaffAccessToken } from "@/lib/google/staff-token";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** `threads.list` page size (BE §8.6). */
export const GMAIL_LIST_PAGE_SIZE = 50;

/** History pages read per `listHistory` call before giving up (the sync then does a full list). */
const MAX_HISTORY_PAGES = 20;

export type GmailApi = {
  listThreads(params: { q?: string; maxResults?: number; pageToken?: string }): Promise<unknown>;
  getThread(id: string, format: "metadata" | "full"): Promise<unknown>;
  listHistory(startHistoryId: string): Promise<unknown>;
  markThreadRead(id: string): Promise<void>;
  createDraft(raw: string, threadId?: string): Promise<{ id: string }>;
  updateDraft(draftId: string, raw: string, threadId?: string): Promise<{ id: string }>;
  sendDraft(draftId: string): Promise<{ messageId: string }>;
  getAttachment(messageId: string, attachmentId: string): Promise<{ data: Buffer; size: number }>;
};

// ── Gmail resources (the subset this app reads) ─────────────────────────────

export type GmailHeader = { name: string; value: string };
export type GmailMessagePart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailMessagePart[];
};
export type GmailMessageResource = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  /** Epoch ms as a string. */
  internalDate?: string;
  payload?: GmailMessagePart;
};
/** What `getThread` resolves to. */
export type GmailThreadResource = {
  id: string;
  historyId?: string;
  snippet?: string;
  messages?: GmailMessageResource[];
};
/** What `listThreads` resolves to. */
export type GmailThreadList = {
  threads?: { id: string; snippet?: string; historyId?: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};
export type GmailMessageRef = { id: string; threadId: string; labelIds?: string[] };
export type GmailHistoryRecord = {
  id: string;
  messages?: GmailMessageRef[];
  messagesAdded?: { message: GmailMessageRef }[];
  labelsAdded?: { message: GmailMessageRef; labelIds?: string[] }[];
  labelsRemoved?: { message: GmailMessageRef; labelIds?: string[] }[];
};
/** What `listHistory` resolves to: every page merged, with the mailbox's latest `historyId`. */
export type GmailHistoryList = { history: GmailHistoryRecord[]; historyId: string | null };

// ── Errors ───────────────────────────────────────────────────────────────────

/** Action error codes the client surfaces (BE §9.10). */
export type GmailErrorCode = "NOT_CONNECTED" | "SCOPE_MISSING" | "RATE_LIMITED" | "NOT_FOUND" | "INVALID" | "FORBIDDEN";

/** `message` is the bare code, so `actionErrorCode()` reads it. */
export class GmailError extends Error {
  constructor(
    readonly code: GmailErrorCode,
    readonly status: number | null = null,
  ) {
    super(code);
    this.name = "GmailError";
  }
}

export function isGmailError(err: unknown, code?: GmailErrorCode): err is GmailError {
  return err instanceof GmailError && (code === undefined || err.code === code);
}

// ── Token ────────────────────────────────────────────────────────────────────

/** Resolves the staff member's Gmail access token; `forceRefresh` after a 401. Throws `GmailError`. */
export type GmailTokenSource = (staffId: string, forceRefresh: boolean) => Promise<string>;

export type GmailClientDeps = {
  fetch?: typeof fetch;
  token?: GmailTokenSource;
  now?: () => Date;
  /** Where the account's error marks and backoff are written (defaults to the app's `db`). */
  db?: OwnerDb;
};

/**
 * The default token source: `getStaffAccessToken(staffId, "gmail")`. A forced
 * refresh makes the stored token look expired so the existing refresh path
 * runs. A refresh refused with `invalid_grant` (the token store then clears
 * the tokens) → `NOT_CONNECTED` + `last_error = 'invalid_grant'`; a grant
 * without the Gmail scopes → `SCOPE_MISSING`; no token → `NOT_CONNECTED`.
 */
export function staffGmailTokenSource(executor: OwnerDb = appDb): GmailTokenSource {
  return async (staffId, forceRefresh) => {
    let invalidGrant = false;
    const result = await getStaffAccessToken(staffId, "gmail", {
      refresh: async (refreshToken: string) => {
        try {
          return await refreshStaffAccessToken(refreshToken);
        } catch (error) {
          if (error instanceof StaffOauthInvalidGrantError) invalidGrant = true;
          throw error;
        }
      },
      ...(forceRefresh ? { now: () => Number.MAX_SAFE_INTEGER } : {}),
    });
    if (result.status === "ok") return result.accessToken;

    if (invalidGrant) {
      await recordGmailError(executor, staffId, GMAIL_ERROR_INVALID_GRANT);
      throw new GmailError("NOT_CONNECTED");
    }
    const scope = await grantedGoogleScope(executor, staffId);
    if (scope !== null && !hasGrantedScope(scope, "gmail")) {
      await recordGmailError(executor, staffId, GMAIL_ERROR_SCOPE_MISSING);
      throw new GmailError("SCOPE_MISSING");
    }
    await recordGmailError(executor, staffId, GMAIL_ERROR_NOT_CONNECTED);
    throw new GmailError("NOT_CONNECTED");
  };
}

// ── Requests ─────────────────────────────────────────────────────────────────

type Query = Record<string, string | number | string[] | undefined>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${GMAIL_API_BASE}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(v));
  }
  return url.toString();
}

/** Every `reason` / `status` / `message` string in a Google API error body. */
function errorReasons(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return [error];
  if (!error || typeof error !== "object") return [];
  const e = error as { status?: unknown; message?: unknown; errors?: unknown; details?: unknown };
  const out: string[] = [];
  if (typeof e.status === "string") out.push(e.status);
  if (typeof e.message === "string") out.push(e.message);
  for (const list of [e.errors, e.details]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const reason = (item as { reason?: unknown } | null)?.reason;
      if (typeof reason === "string") out.push(reason);
    }
  }
  return out;
}

const SCOPE_REASON = /insufficient|scope/i;
const RATE_REASON = /ratelimit|rate limit|quota/i;

const seg = (value: string) => encodeURIComponent(value);

/** A client bound to one staff member's Google token. Throws `NOT_CONNECTED` / `SCOPE_MISSING`. */
export async function gmailClient(staffId: string, deps: GmailClientDeps = {}): Promise<GmailApi> {
  const executor = deps.db ?? appDb;
  const fetchImpl = deps.fetch ?? fetch;
  const tokenSource = deps.token ?? staffGmailTokenSource(executor);
  const now = deps.now ?? (() => new Date());

  // Disconnected (review B15) or never connected: no Gmail calls at all.
  const account = await findGmailAccountState(executor, staffId);
  if (!account || account.disconnectedAt) throw new GmailError("NOT_CONNECTED");

  let token = await tokenSource(staffId, false);

  async function failure(res: Response): Promise<Error> {
    const status = res.status;
    if (status === 401) return new GmailError("NOT_CONNECTED", status);
    const body: unknown = await res.json().catch(() => null);
    const reasons = errorReasons(body);
    if (status === 403 && reasons.some((r) => SCOPE_REASON.test(r))) {
      await recordGmailError(executor, staffId, GMAIL_ERROR_SCOPE_MISSING);
      return new GmailError("SCOPE_MISSING", status);
    }
    if (status === 429 || status >= 500 || (status === 403 && reasons.some((r) => RATE_REASON.test(r)))) {
      await applyGmailBackoff(executor, staffId, now());
      return new GmailError("RATE_LIMITED", status);
    }
    if (status === 403) return new GmailError("FORBIDDEN", status);
    if (status === 404) return new GmailError("NOT_FOUND", status);
    if (status === 400) return new GmailError("INVALID", status);
    return new Error(`gmail.http_${status}`);
  }

  async function call<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    opts: { query?: Query; body?: unknown } = {},
  ): Promise<T> {
    let refreshed = false;
    for (;;) {
      const res = await fetchImpl(buildUrl(path, opts.query), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        cache: "no-store",
      });
      if (res.ok) {
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        token = await tokenSource(staffId, true);
        continue;
      }
      throw await failure(res);
    }
  }

  return {
    listThreads: ({ q, maxResults = GMAIL_LIST_PAGE_SIZE, pageToken }) =>
      call<GmailThreadList>("GET", "/threads", { query: { q, maxResults, pageToken } }),

    getThread: (id, format) =>
      call<GmailThreadResource>("GET", `/threads/${seg(id)}`, {
        query:
          format === "metadata" ? { format, metadataHeaders: ["Subject", "From", "To", "Cc", "Date"] } : { format },
      }),

    async listHistory(startHistoryId): Promise<GmailHistoryList> {
      const history: GmailHistoryRecord[] = [];
      let historyId: string | null = null;
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
        const res = await call<{ history?: GmailHistoryRecord[]; historyId?: string; nextPageToken?: string }>(
          "GET",
          "/history",
          {
            query: {
              startHistoryId,
              historyTypes: ["messageAdded", "labelAdded", "labelRemoved"],
              maxResults: 500,
              pageToken,
            },
          },
        );
        history.push(...(res?.history ?? []));
        historyId = res?.historyId ?? historyId;
        pageToken = res?.nextPageToken;
        if (!pageToken) return { history, historyId };
      }
      // Too much history for one sync: the caller falls back to a full list.
      throw new GmailError("NOT_FOUND");
    },

    async markThreadRead(id) {
      await call("POST", `/threads/${seg(id)}/modify`, { body: { removeLabelIds: ["UNREAD"] } });
    },

    async createDraft(raw, threadId) {
      const draft = await call<{ id: string }>("POST", "/drafts", {
        body: { message: { raw, ...(threadId ? { threadId } : {}) } },
      });
      return { id: draft.id };
    },

    async updateDraft(draftId, raw, threadId) {
      const draft = await call<{ id: string }>("PUT", `/drafts/${seg(draftId)}`, {
        body: { id: draftId, message: { raw, ...(threadId ? { threadId } : {}) } },
      });
      return { id: draft.id };
    },

    async sendDraft(draftId) {
      const message = await call<{ id: string }>("POST", "/drafts/send", { body: { id: draftId } });
      return { messageId: message.id };
    },

    async getAttachment(messageId, attachmentId) {
      const res = await call<{ size?: number; data?: string }>(
        "GET",
        `/messages/${seg(messageId)}/attachments/${seg(attachmentId)}`,
      );
      const data = Buffer.from(res?.data ?? "", "base64url");
      return { data, size: res?.size ?? data.length };
    },
  };
}

/**
 * Sends the caller's draft (BE §8.6): shared by `sendGmailDraftAction` (after
 * the confirm token check) and the assistant `send_email` tool (after the AI
 * SDK approval). A draft that isn't in the caller's mailbox → `NOT_FOUND`.
 */
export async function sendDraft(staffId: string, draftId: string): Promise<{ messageId: string }> {
  const api = await gmailClient(staffId);
  return api.sendDraft(draftId);
}
