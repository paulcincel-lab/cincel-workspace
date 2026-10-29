/**
 * monday.com GraphQL client for the migration CLI
 * (docs/specs/monday-migration/backend.md §3, §11).
 *
 * - Every call is `POST https://api.monday.com/v2` with `API-Version: 2026-07`.
 * - A response with `errors[]` is a failed call even on HTTP 200 and even when
 *   it carries partial `data`: the data is never returned, so a caller can
 *   never write a partial page.
 * - Rate limits sleep for `retry_in_seconds` (body) or `Retry-After` (header)
 *   and retry; other transient failures back off exponentially. At most
 *   MAX_ATTEMPTS attempts per call.
 * - "Query too complex" and "cursor expired" are not retried here: they are
 *   thrown as their own error types so `paginateItems` can lower the page size
 *   or restart the board.
 *
 * The token is only ever sent in the Authorization header; no error message or
 * log line built here includes it.
 */

import type { TypedDocumentString } from "./generated/graphql";

export const MONDAY_API_URL = "https://api.monday.com/v2";
export const MONDAY_API_VERSION = "2026-07";
export const MAX_ATTEMPTS = 5;

/** Backoff for failures that don't say how long to wait: 1s, 2s, 4s, 8s… capped. */
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/** Error codes monday uses for limits that clear after `retry_in_seconds`. */
const RATE_LIMIT_CODES = new Set([
  "RATE_LIMIT_EXCEEDED",
  "COMPLEXITY_BUDGET_EXHAUSTED",
  "ComplexityException",
  "IP_RATE_LIMIT_EXCEEDED",
  "CONCURRENCY_LIMIT_EXCEEDED",
  "MAX_CONCURRENCY_EXCEEDED",
]);

/** The daily call limit only resets at 00:00 UTC: stop instead of sleeping for hours. */
const DAILY_LIMIT_CODES = new Set(["DAILY_LIMIT_EXCEEDED"]);

/** A single query costs more than the per-query maximum: retrying it as-is can't succeed. */
const MAX_COMPLEXITY_CODES = new Set(["maxComplexityExceeded", "MAX_COMPLEXITY_EXCEEDED"]);

const CURSOR_EXPIRED_CODES = new Set(["CursorExpiredError", "CURSOR_EXPIRED"]);

/** Errors that will fail the same way on every attempt. */
const FATAL_CODES = new Set([
  "UNAUTHORIZED",
  "Unauthorized",
  "USER_UNAUTHORIZED",
  "INVALID_TOKEN",
  "GRAPHQL_VALIDATION_FAILED",
  "ParseError",
  "InvalidArgumentException",
]);

export interface MondayGraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: {
    code?: string;
    status_code?: number;
    retry_in_seconds?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Base class: a call that failed for good. `attempts` is how many requests were made. */
export class MondayApiError extends Error {
  readonly code: string | undefined;
  readonly status: number | undefined;
  readonly errors: MondayGraphQLError[];
  readonly attempts: number;

  constructor(
    message: string,
    opts: { code?: string; status?: number; errors?: MondayGraphQLError[]; attempts: number },
  ) {
    super(message);
    this.name = "MondayApiError";
    this.code = opts.code;
    this.status = opts.status;
    this.errors = opts.errors ?? [];
    this.attempts = opts.attempts;
  }
}

/** The query is over monday's per-query complexity limit; ask for fewer items. */
export class MondayComplexityError extends MondayApiError {
  constructor(message: string, opts: ConstructorParameters<typeof MondayApiError>[1]) {
    super(message, opts);
    this.name = "MondayComplexityError";
  }
}

/** The `items_page` cursor expired (60 min after the board's first page); restart the board. */
export class MondayCursorExpiredError extends MondayApiError {
  constructor(message: string, opts: ConstructorParameters<typeof MondayApiError>[1]) {
    super(message, opts);
    this.name = "MondayCursorExpiredError";
  }
}

/** The account's daily call limit is used up; the export can be resumed after 00:00 UTC. */
export class MondayDailyLimitError extends MondayApiError {
  constructor(message: string, opts: ConstructorParameters<typeof MondayApiError>[1]) {
    super(message, opts);
    this.name = "MondayDailyLimitError";
  }
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface MondayClientOptions {
  token: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  url?: string;
  /** Called before each retry with the attempt that failed and how long it waits. */
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void;
}

/** A query: plain text, or a generated typed document (scripts/monday/queries.ts). */
export type MondayQuery = string | TypedDocumentString<unknown, never>;

export interface MondayClient {
  /** Runs one typed query; result and variables are checked against the 2026-07 schema. */
  request<TResult, TVariables>(
    query: TypedDocumentString<TResult, TVariables>,
    variables: TVariables,
  ): Promise<TResult>;
  /** Runs one query and returns `data`, or throws a MondayApiError. Never returns partial data. */
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  /** Number of HTTP requests sent so far (retries included). */
  readonly callCount: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Outcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "retry"; delayMs: number | null; reason: string; error: MondayApiError }
  | { kind: "fail"; error: MondayApiError };

function errorCode(e: MondayGraphQLError): string | undefined {
  return e.extensions?.code ?? (typeof e.error_code === "string" ? e.error_code : undefined);
}

function describe(errors: MondayGraphQLError[]): string {
  return errors
    .map((e) => {
      const code = errorCode(e);
      return code ? `${code}: ${e.message}` : e.message;
    })
    .join("; ");
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - Date.now());
}

function retryInSeconds(errors: MondayGraphQLError[], body: Record<string, unknown>): number | null {
  for (const e of errors) {
    const s = e.extensions?.retry_in_seconds ?? e.retry_in_seconds;
    if (typeof s === "number" && s >= 0) return s * 1000;
  }
  const top = body.retry_in_seconds;
  return typeof top === "number" && top >= 0 ? top * 1000 : null;
}

/** Normalizes both the GraphQL `errors[]` shape and monday's older `error_code` / `error_message` body. */
function collectErrors(body: Record<string, unknown>): MondayGraphQLError[] {
  const errors: MondayGraphQLError[] = [];
  if (Array.isArray(body.errors)) {
    for (const e of body.errors) {
      if (e && typeof e === "object") {
        const err = e as MondayGraphQLError;
        errors.push({ ...err, message: String(err.message ?? "Unknown error") });
      } else {
        errors.push({ message: String(e) });
      }
    }
  }
  if (typeof body.error_code === "string" || typeof body.error_message === "string") {
    errors.push({
      message: String(body.error_message ?? body.error_code),
      extensions: {
        code: typeof body.error_code === "string" ? body.error_code : undefined,
        status_code: typeof body.status_code === "number" ? body.status_code : undefined,
      },
    });
  }
  return errors;
}

function isCursorExpired(errors: MondayGraphQLError[]): boolean {
  return errors.some((e) => {
    const code = errorCode(e);
    return (code && CURSOR_EXPIRED_CODES.has(code)) || /cursor.*expired/i.test(e.message);
  });
}

function isMaxComplexity(errors: MondayGraphQLError[]): boolean {
  return errors.some((e) => {
    const code = errorCode(e);
    return (
      (code && MAX_COMPLEXITY_CODES.has(code)) ||
      /exceeds max complexity|max complexity exceeded/i.test(e.message)
    );
  });
}

function classify<T>(status: number, headers: { get(name: string): string | null }, text: string, attempt: number): Outcome<T> {
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = null;
  }

  const errors = body ? collectErrors(body) : [];
  const opts = { status, errors, attempts: attempt, code: errors.map(errorCode).find(Boolean) };
  const codes = new Set(errors.map(errorCode).filter((c): c is string => Boolean(c)));
  const has = (set: Set<string>) => [...codes].some((c) => set.has(c));

  if (status === 200 && body && errors.length === 0) {
    if (!("data" in body) || body.data == null) {
      return {
        kind: "retry",
        delayMs: null,
        reason: "response without data",
        error: new MondayApiError("monday: response without data", opts),
      };
    }
    return { kind: "ok", data: body.data as T };
  }

  const detail = errors.length ? describe(errors) : `HTTP ${status}`;

  if (isCursorExpired(errors)) {
    return { kind: "fail", error: new MondayCursorExpiredError(`monday: cursor expired (${detail})`, opts) };
  }
  if (isMaxComplexity(errors)) {
    return { kind: "fail", error: new MondayComplexityError(`monday: query too complex (${detail})`, opts) };
  }
  if (has(DAILY_LIMIT_CODES)) {
    return {
      kind: "fail",
      error: new MondayDailyLimitError(
        `monday: daily call limit reached; re-run after 00:00 UTC to resume (${detail})`,
        opts,
      ),
    };
  }
  if (status === 401 || status === 403 || has(FATAL_CODES)) {
    return { kind: "fail", error: new MondayApiError(`monday: request rejected (${detail})`, opts) };
  }

  const waitMs = (body ? retryInSeconds(errors, body) : null) ?? parseRetryAfter(headers.get("retry-after"));
  if (status === 429 || has(RATE_LIMIT_CODES)) {
    return {
      kind: "retry",
      delayMs: waitMs,
      reason: `rate limited (${detail})`,
      error: new MondayApiError(`monday: rate limited (${detail})`, opts),
    };
  }

  if (status >= 400 && status < 500 && status !== 408) {
    return { kind: "fail", error: new MondayApiError(`monday: request failed (${detail})`, opts) };
  }

  // 5xx, 408, unparsable bodies and any other errors[] on 200: a failed call, retried.
  return {
    kind: "retry",
    delayMs: waitMs,
    reason: detail,
    error: new MondayApiError(`monday: request failed (${detail})`, opts),
  };
}

function backoff(attempt: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1));
}

export function createMondayClient(options: MondayClientOptions): MondayClient {
  const {
    token,
    fetch: doFetch = globalThis.fetch as unknown as FetchLike,
    sleep = defaultSleep,
    maxAttempts = MAX_ATTEMPTS,
    url = MONDAY_API_URL,
    onRetry,
  } = options;
  if (!token) throw new Error("monday: a token is required");

  let callCount = 0;

  async function request<T>(query: MondayQuery, variables: object = {}): Promise<T> {
    const body = JSON.stringify({ query: query.toString(), variables });
    let last: MondayApiError | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      callCount++;
      let outcome: Outcome<T>;
      try {
        const res = await doFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "API-Version": MONDAY_API_VERSION,
            Authorization: token,
          },
          body,
        });
        outcome = classify<T>(res.status, res.headers, await res.text(), attempt);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        outcome = {
          kind: "retry",
          delayMs: null,
          reason: `network error (${message})`,
          error: new MondayApiError(`monday: network error (${message})`, { attempts: attempt }),
        };
      }

      if (outcome.kind === "ok") return outcome.data;
      if (outcome.kind === "fail") throw outcome.error;

      last = outcome.error;
      if (attempt === maxAttempts) break;
      const delayMs = outcome.delayMs ?? backoff(attempt);
      onRetry?.({ attempt, delayMs, reason: outcome.reason });
      await sleep(delayMs);
    }

    throw new MondayApiError(`${last!.message} after ${maxAttempts} attempts`, {
      code: last!.code,
      status: last!.status,
      errors: last!.errors,
      attempts: maxAttempts,
    });
  }

  return {
    request,
    get callCount() {
      return callCount;
    },
  };
}

// ---------------------------------------------------------------------------
// Item pagination: items_page → next_items_page
// ---------------------------------------------------------------------------

export interface ItemsPage<Item> {
  cursor: string | null;
  items: Item[];
}

export interface PaginateItemsOptions<Item> {
  boardId: string;
  /** Starting page size (200; 50 on multi-level boards). monday's maximum is 500. */
  pageSize: number;
  /** Smallest page size to fall back to on "query too complex" before giving up. */
  minPageSize?: number;
  /** `query FirstPage($board: [ID!], $limit: Int!)` (backend.md §4.2). */
  firstPageQuery: MondayQuery;
  /** `query NextPage($cursor: String!, $limit: Int!)` (backend.md §4.2). */
  nextPageQuery: MondayQuery;
  /** How many times an expired cursor may restart the board before giving up. */
  maxRestarts?: number;
  /** Called once per complete page, in order. */
  onPage?: (items: Item[], info: { page: number; pageSize: number }) => void | Promise<void>;
  /** Called when the board starts over after its cursor expired: drop what onPage received. */
  onRestart?: (info: { restart: number }) => void | Promise<void>;
  /** Called when the page size is lowered after a complexity error. */
  onPageSizeChange?: (info: { from: number; to: number }) => void;
}

const DEFAULT_MIN_PAGE_SIZE = 10;
const DEFAULT_MAX_RESTARTS = 2;

type FirstPageData<Item> = { boards: { items_page: ItemsPage<Item> }[] | null };
type NextPageData<Item> = { next_items_page: ItemsPage<Item> };

/**
 * Reads every item of one board. A "query too complex" error halves the page
 * size and retries the same page; an expired cursor restarts the board from
 * the first page (onRestart lets the caller drop what it already wrote).
 * Returns all items of the board in API order.
 */
export async function paginateItems<Item>(
  client: MondayClient,
  options: PaginateItemsOptions<Item>,
): Promise<Item[]> {
  const minPageSize = Math.max(1, options.minPageSize ?? DEFAULT_MIN_PAGE_SIZE);
  const maxRestarts = options.maxRestarts ?? DEFAULT_MAX_RESTARTS;
  let pageSize = Math.min(500, Math.max(minPageSize, options.pageSize));

  async function withSmallerPages<T>(fetchPage: (limit: number) => Promise<T>): Promise<T> {
    for (;;) {
      try {
        return await fetchPage(pageSize);
      } catch (err) {
        if (!(err instanceof MondayComplexityError) || pageSize <= minPageSize) throw err;
        const next = Math.max(minPageSize, Math.floor(pageSize / 2));
        options.onPageSizeChange?.({ from: pageSize, to: next });
        pageSize = next;
      }
    }
  }

  for (let restart = 0; ; restart++) {
    const items: Item[] = [];
    try {
      let page = 1;
      const first = await withSmallerPages((limit) =>
        client.request<FirstPageData<Item>>(options.firstPageQuery.toString(), {
          board: [options.boardId],
          limit,
        }),
      );
      const board = first.boards?.[0];
      if (!board) {
        throw new MondayApiError(`monday: board ${options.boardId} not found or not visible to this token`, {
          attempts: 1,
        });
      }
      let current = board.items_page;
      for (;;) {
        items.push(...current.items);
        await options.onPage?.(current.items, { page, pageSize });
        if (!current.cursor) return items;
        const cursor = current.cursor;
        page++;
        const next = await withSmallerPages((limit) =>
          client.request<NextPageData<Item>>(options.nextPageQuery.toString(), { cursor, limit }),
        );
        current = next.next_items_page;
      }
    } catch (err) {
      if (!(err instanceof MondayCursorExpiredError) || restart >= maxRestarts) throw err;
      await options.onRestart?.({ restart: restart + 1 });
    }
  }
}
