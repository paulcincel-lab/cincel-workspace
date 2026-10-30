// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDirectoryClient,
  DIRECTORY_TIMEOUT_MS,
  DirectoryError,
  getDirectory,
  lookupMembership,
  type DirectoryClient,
} from "./directory";

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function reply(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function client(timeoutMs?: number) {
  return createDirectoryClient({ getAccessToken: async () => "sa-token", fetch: fetchMock, timeoutMs });
}

function call(n: number) {
  const [input, init] = fetchMock.mock.calls[n];
  return { url: new URL(input), init: init ?? {}, headers: (init?.headers ?? {}) as Record<string, string> };
}

beforeEach(() => {
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("directory client", () => {
  it("defaults to a 5 s timeout", () => {
    expect(DIRECTORY_TIMEOUT_MS).toBe(5000);
  });

  it("gets a user's status by sub as the service account", async () => {
    fetchMock.mockResolvedValue(reply(200, { primaryEmail: "ana@example.test", suspended: false, archived: false }));
    await expect(client().getUserStatus("1234")).resolves.toEqual({
      status: "active",
      primaryEmail: "ana@example.test",
    });

    const { url, headers, init } = call(0);
    expect(url.origin + url.pathname).toBe("https://admin.googleapis.com/admin/directory/v1/users/1234");
    expect(headers.Authorization).toBe("Bearer sa-token");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps suspended, archived and missing users", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { primaryEmail: "a@example.test", suspended: true, archived: true }));
    fetchMock.mockResolvedValueOnce(reply(200, { primaryEmail: "b@example.test", archived: true }));
    fetchMock.mockResolvedValueOnce(reply(404, { error: { message: "Resource Not Found: userKey" } }));
    const directory = client();
    await expect(directory.getUserStatus("a")).resolves.toMatchObject({ status: "suspended" });
    await expect(directory.getUserStatus("b")).resolves.toMatchObject({ status: "archived" });
    await expect(directory.getUserStatus("c")).resolves.toEqual({ status: "deleted", primaryEmail: null });
  });

  it("checks membership with hasMember", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { isMember: true }));
    fetchMock.mockResolvedValueOnce(reply(200, { isMember: false }));
    const directory = client();
    await expect(directory.hasMember("g1", "ana@example.test")).resolves.toBe(true);
    await expect(directory.hasMember("g1", "luis@example.test")).resolves.toBe(false);
    expect(call(0).url.pathname).toBe("/admin/directory/v1/groups/g1/hasMember/ana%40example.test");
  });

  it("treats a missing group in hasMember as an error", async () => {
    fetchMock.mockResolvedValue(reply(404));
    await expect(client().hasMember("gone", "ana@example.test")).rejects.toMatchObject({ kind: "http", status: 404 });
  });

  it("gets a group by email, null when it doesn't exist", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { id: "g1", email: "cincel-todos@example.test", name: "Todos" }));
    fetchMock.mockResolvedValueOnce(reply(404));
    const directory = client();
    await expect(directory.getGroup("cincel-todos@example.test")).resolves.toEqual({
      id: "g1",
      email: "cincel-todos@example.test",
      name: "Todos",
    });
    expect(call(0).url.pathname).toBe("/admin/directory/v1/groups/cincel-todos%40example.test");
    await expect(directory.getGroup("nope@example.test")).resolves.toBeNull();
  });

  it("throws a DirectoryError on 5xx and network failures", async () => {
    fetchMock.mockResolvedValueOnce(reply(503));
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const directory = client();
    await expect(directory.getUserStatus("x")).rejects.toMatchObject({ kind: "http", status: 503 });
    await expect(directory.getUserStatus("x")).rejects.toMatchObject({ kind: "network" });
  });

  it("times out a slow request", async () => {
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    );
    const error = await client(20)
      .getUserStatus("x")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DirectoryError);
    expect((error as DirectoryError).kind).toBe("timeout");
  });

  it("times out a slow token", async () => {
    const directory = createDirectoryClient({
      getAccessToken: () => new Promise(() => {}),
      fetch: fetchMock,
      timeoutMs: 20,
    });
    await expect(directory.getGroup("x@example.test")).rejects.toMatchObject({ kind: "timeout" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is null when the service account isn't configured", () => {
    vi.stubEnv("GOOGLE_FAKE", "");
    vi.stubEnv("GOOGLE_SA_CLIENT_EMAIL", "");
    vi.stubEnv("GOOGLE_SA_PRIVATE_KEY", "");
    expect(getDirectory()).toBeNull();
  });
});

describe("lookupMembership", () => {
  function stub(overrides: Partial<DirectoryClient> = {}): DirectoryClient {
    return {
      getUserStatus: vi.fn(async () => ({ status: "active" as const, primaryEmail: "ana@example.test" })),
      hasMember: vi.fn(async (groupId: string) => groupId !== "g2"),
      getGroup: vi.fn(async () => null),
      ...overrides,
    };
  }

  it("runs users.get and every hasMember in parallel", async () => {
    const started: string[] = [];
    const resolvers: (() => void)[] = [];
    function gate<T>(label: string, value: T): Promise<T> {
      return new Promise<T>((resolve) => {
        started.push(label);
        resolvers.push(() => resolve(value));
      });
    }
    const directory = stub({
      getUserStatus: () => gate("user", { status: "active" as const, primaryEmail: "ana@example.test" }),
      hasMember: (groupId) => gate(groupId, groupId !== "g2"),
    });

    const pending = lookupMembership(directory, "sub", "ana@example.test", ["g1", "g2", "g3"]);
    expect(started).toEqual(["user", "g1", "g2", "g3"]);
    resolvers.forEach((resolve) => resolve());
    await expect(pending).resolves.toEqual({
      user: { status: "active", primaryEmail: "ana@example.test" },
      memberGroupIds: ["g1", "g3"],
    });
  });

  it("rejects when any call fails", async () => {
    const directory = stub({
      hasMember: async () => {
        throw new DirectoryError("down", "timeout");
      },
    });
    await expect(lookupMembership(directory, "sub", "ana@example.test", ["g1"])).rejects.toMatchObject({
      kind: "timeout",
    });
  });
});
