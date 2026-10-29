// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import fixtures from "@/scripts/monday/__fixtures__/client-responses.json";
import {
  createMondayClient,
  MAX_ATTEMPTS,
  MONDAY_API_URL,
  MONDAY_API_VERSION,
  MondayApiError,
  MondayComplexityError,
  MondayCursorExpiredError,
  MondayDailyLimitError,
  paginateItems,
  type FetchLike,
} from "@/scripts/monday/client";

type Fixture = keyof typeof fixtures;
type Reply = Fixture | { status?: number; body?: unknown; raw?: string; headers?: Record<string, string> } | Error;

const TOKEN = "secret-token-123";

/** A fake fetch that answers each call with the next reply in the list (the last one repeats). */
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; headers: Record<string, string>; body: { query: string; variables: Record<string, unknown> } }[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    const r = typeof reply === "string" ? { body: fixtures[reply] } : reply;
    const headers = new Map(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      status: r.status ?? 200,
      headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
      text: async () => r.raw ?? JSON.stringify(r.body),
    };
  };
  return { fn, calls };
}

function setup(replies: Reply[], maxAttempts?: number) {
  const f = fakeFetch(replies);
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const client = createMondayClient({ token: TOKEN, fetch: f.fn, sleep, maxAttempts });
  return { client, calls: f.calls, sleep };
}

async function catchError(p: Promise<unknown>): Promise<MondayApiError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(MondayApiError);
    return err as MondayApiError;
  }
  throw new Error("expected the call to fail");
}

describe("monday client request", () => {
  it("posts to the v2 endpoint with API-Version 2026-07 and the token", async () => {
    const { client, calls } = setup(["okBoards"]);
    const data = await client.request<{ boards: { id: string }[] }>("query { boards { id } }", { page: 1 });
    expect(data.boards[0].id).toBe("123");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(MONDAY_API_URL);
    expect(calls[0].headers["API-Version"]).toBe(MONDAY_API_VERSION);
    expect(MONDAY_API_VERSION).toBe("2026-07");
    expect(calls[0].headers.Authorization).toBe(TOKEN);
    expect(calls[0].body).toEqual({ query: "query { boards { id } }", variables: { page: 1 } });
    expect(client.callCount).toBe(1);
  });

  it("treats errors[] on HTTP 200 as a failed call and retries it", async () => {
    const { client, calls, sleep } = setup(["errorsOn200WithPartialData", "okBoards"]);
    const data = await client.request<{ boards: unknown[] }>("query { boards { id } }");
    expect(data).toEqual(fixtures.okBoards.data);
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("never returns the partial data of a 200 with errors[]", async () => {
    const { client, calls } = setup(["errorsOn200WithPartialData"]);
    const onData = vi.fn();
    const err = await catchError(client.request("query").then(onData));
    expect(onData).not.toHaveBeenCalled();
    expect(calls).toHaveLength(MAX_ATTEMPTS);
    expect(err.attempts).toBe(MAX_ATTEMPTS);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
    expect(err.message).toContain("after 5 attempts");
    expect(err).not.toHaveProperty("data");
  });

  it("sleeps for retry_in_seconds from the error body", async () => {
    const { client, sleep } = setup(["rateLimitRetryInSeconds", "okBoards"]);
    await client.request("query");
    expect(sleep).toHaveBeenCalledWith(17_000);
  });

  it("sleeps for the Retry-After header on minute limits", async () => {
    const { client, sleep } = setup([
      { status: 429, body: fixtures.rateLimitMinute, headers: { "Retry-After": "23" } },
      "okBoards",
    ]);
    await client.request("query");
    expect(sleep).toHaveBeenCalledWith(23_000);
  });

  it("prefers retry_in_seconds over Retry-After", async () => {
    const { client, sleep } = setup([
      { status: 429, body: fixtures.rateLimitRetryInSeconds, headers: { "Retry-After": "60" } },
      "okBoards",
    ]);
    await client.request("query");
    expect(sleep).toHaveBeenCalledWith(17_000);
  });

  it("backs off exponentially when no wait is given (5xx, network errors)", async () => {
    const { client, sleep } = setup([
      { status: 502, raw: "<html>Bad gateway</html>" },
      new Error("socket hang up"),
      { status: 500, body: fixtures.legacyErrorCode },
      "okBoards",
    ]);
    await client.request("query");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1_000, 2_000, 4_000]);
    expect(client.callCount).toBe(4);
  });

  it("stops after max attempts", async () => {
    const { client, calls, sleep } = setup(["rateLimitMinute"]);
    const err = await catchError(client.request("query"));
    expect(calls).toHaveLength(5);
    expect(sleep).toHaveBeenCalledTimes(4);
    expect(err.attempts).toBe(5);
    expect(err.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("honors a custom maxAttempts", async () => {
    const { client, calls } = setup(["rateLimitMinute"], 2);
    await catchError(client.request("query"));
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["maxComplexityExceeded", MondayComplexityError],
    ["cursorExpired", MondayCursorExpiredError],
    ["dailyLimit", MondayDailyLimitError],
  ] as const)("throws %s at once without retrying", async (fixture, type) => {
    const { client, calls, sleep } = setup([fixture, "okBoards"]);
    const err = await catchError(client.request("query"));
    expect(err).toBeInstanceOf(type);
    expect(calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry an unauthorized token", async () => {
    const { client, calls } = setup([{ status: 401, body: fixtures.unauthorized }]);
    const err = await catchError(client.request("query"));
    expect(calls).toHaveLength(1);
    expect(err.status).toBe(401);
  });

  it("never puts the token in an error message", async () => {
    const { client } = setup([new Error("connect ECONNREFUSED")]);
    const err = await catchError(client.request("query"));
    expect(err.message).not.toContain(TOKEN);
    expect(JSON.stringify(err.errors)).not.toContain(TOKEN);
  });

  it("requires a token", () => {
    expect(() => createMondayClient({ token: "" })).toThrow(/token/);
  });
});

const FIRST = "query FirstPage($board: [ID!], $limit: Int!) { ... }";
const NEXT = "query NextPage($cursor: String!, $limit: Int!) { ... }";

describe("monday paginateItems", () => {
  it("reads items_page then next_items_page until the cursor is null", async () => {
    const { client, calls } = setup(["itemsFirstPage", "itemsNextPage", "itemsLastPage"]);
    const pages: string[][] = [];
    const items = await paginateItems<{ id: string }>(client, {
      boardId: "123",
      pageSize: 200,
      firstPageQuery: FIRST,
      nextPageQuery: NEXT,
      onPage: (page) => {
        pages.push(page.map((i) => i.id));
      },
    });
    expect(items.map((i) => i.id)).toEqual(["1", "2", "3", "4"]);
    expect(pages).toEqual([["1", "2"], ["3"], ["4"]]);
    expect(calls.map((c) => c.body.variables)).toEqual([
      { board: ["123"], limit: 200 },
      { cursor: "CURSOR_1", limit: 200 },
      { cursor: "CURSOR_2", limit: 200 },
    ]);
  });

  it("never hands a page with errors[] to onPage", async () => {
    const { client } = setup(["itemsFirstPage", "errorsOn200WithPartialData", "itemsLastPage"]);
    const seen: string[] = [];
    const items = await paginateItems<{ id: string }>(client, {
      boardId: "123",
      pageSize: 200,
      firstPageQuery: FIRST,
      nextPageQuery: NEXT,
      onPage: (page) => {
        seen.push(...page.map((i) => i.id));
      },
    });
    expect(seen).not.toContain("1001");
    expect(items.map((i) => i.id)).toEqual(["1", "2", "4"]);
  });

  it("halves the page size and retries the same page when the query is too complex", async () => {
    const { client, calls } = setup([
      "itemsFirstPage",
      "maxComplexityExceeded",
      "maxComplexityExceeded",
      "itemsLastPage",
    ]);
    const changes: { from: number; to: number }[] = [];
    const items = await paginateItems<{ id: string }>(client, {
      boardId: "123",
      pageSize: 200,
      firstPageQuery: FIRST,
      nextPageQuery: NEXT,
      onPageSizeChange: (c) => changes.push(c),
    });
    expect(items.map((i) => i.id)).toEqual(["1", "2", "4"]);
    expect(changes).toEqual([
      { from: 200, to: 100 },
      { from: 100, to: 50 },
    ]);
    expect(calls.slice(1).map((c) => c.body.variables)).toEqual([
      { cursor: "CURSOR_1", limit: 200 },
      { cursor: "CURSOR_1", limit: 100 },
      { cursor: "CURSOR_1", limit: 50 },
    ]);
  });

  it("gives up when the query is still too complex at the minimum page size", async () => {
    const { client, calls } = setup(["maxComplexityExceeded"]);
    const err = await catchError(
      paginateItems(client, {
        boardId: "123",
        pageSize: 40,
        minPageSize: 10,
        firstPageQuery: FIRST,
        nextPageQuery: NEXT,
      }),
    );
    expect(err).toBeInstanceOf(MondayComplexityError);
    expect(calls.map((c) => c.body.variables.limit)).toEqual([40, 20, 10]);
  });

  it("restarts the board from the first page when the cursor expires", async () => {
    const { client, calls } = setup([
      "itemsFirstPage",
      "cursorExpired",
      "itemsFirstPage",
      "itemsNextPage",
      "itemsLastPage",
    ]);
    const onRestart = vi.fn();
    const seen: string[] = [];
    const items = await paginateItems<{ id: string }>(client, {
      boardId: "123",
      pageSize: 200,
      firstPageQuery: FIRST,
      nextPageQuery: NEXT,
      onPage: (page) => {
        seen.push(...page.map((i) => i.id));
      },
      onRestart: () => {
        onRestart();
        seen.length = 0;
      },
    });
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(items.map((i) => i.id)).toEqual(["1", "2", "3", "4"]);
    expect(seen).toEqual(["1", "2", "3", "4"]);
    expect(calls[2].body.query).toBe(FIRST);
    expect(calls[2].body.variables).toEqual({ board: ["123"], limit: 200 });
  });

  it("stops restarting after maxRestarts", async () => {
    // Every NextPage call expires: first page, expired, first page, expired, ...
    const { client, calls } = setup([
      "itemsFirstPage",
      "cursorExpired",
      "itemsFirstPage",
      "cursorExpired",
      "itemsFirstPage",
      "cursorExpired",
    ]);
    const onRestart = vi.fn();
    const err = await catchError(
      paginateItems(client, {
        boardId: "123",
        pageSize: 200,
        firstPageQuery: FIRST,
        nextPageQuery: NEXT,
        maxRestarts: 2,
        onRestart,
      }),
    );
    expect(err).toBeInstanceOf(MondayCursorExpiredError);
    expect(onRestart).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(6);
  });

  it("fails clearly when the board isn't visible to the token", async () => {
    const { client } = setup([{ body: { data: { boards: [] } } }]);
    const err = await catchError(
      paginateItems(client, { boardId: "999", pageSize: 200, firstPageQuery: FIRST, nextPageQuery: NEXT }),
    );
    expect(err.message).toContain("board 999");
  });
});
