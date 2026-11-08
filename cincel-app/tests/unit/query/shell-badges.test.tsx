// @vitest-environment happy-dom
/**
 * `qk.shell.badges()` (plan §4.3 Shell, §4.5, decision D5): the query
 * options, the response parser, the 60 s poll through the private GET route
 * (none while the tab is hidden) and the Bandeja's cache patch.
 */
import { focusManager, useQuery } from "@tanstack/react-query";
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { qk, STALE } from "@/lib/query/keys";
import {
  parseBadges,
  SHELL_BADGES_REFETCH_MS,
  SHELL_BADGES_URL,
  setShellBadgesUnread,
  shellBadgesOptions,
} from "@/lib/query/options/shell";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { ShellBadges } from "@/lib/types/shell";

const SEED: ShellBadges = { tareasOpen: 4, bandeja: { unreadCount: 2, dueReminders: [] } };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function Probe() {
  const { data } = useQuery(shellBadgesOptions());
  return <p data-testid="badges">{data ? `${data.tareasOpen}/${data.bandeja.unreadCount}` : "none"}</p>;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => json({ tareasOpen: 5, bandeja: { unreadCount: 1, dueReminders: [] } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
});

describe("shellBadgesOptions", () => {
  it("keys on qk.shell.badges(), 30 s stale, polls every 60 s, never in the background", () => {
    const options = shellBadgesOptions();
    expect(options.queryKey).toEqual(qk.shell.badges());
    expect(options.staleTime).toBe(STALE.shellBadges);
    expect(options.staleTime).toBe(30_000);
    expect(options.refetchInterval).toBe(SHELL_BADGES_REFETCH_MS);
    expect(SHELL_BADGES_REFETCH_MS).toBe(60_000);
    expect(options.refetchIntervalInBackground).toBe(false);
  });

  it("reads the private GET route with no-store", async () => {
    const client = createTestQueryClient();
    await expect(client.fetchQuery(shellBadgesOptions())).resolves.toEqual({
      tareasOpen: 5,
      bandeja: { unreadCount: 1, dueReminders: [] },
    });
    expect(fetchMock).toHaveBeenCalledWith(SHELL_BADGES_URL, expect.objectContaining({ cache: "no-store" }));
    expect(SHELL_BADGES_URL).toBe("/api/shell/badges");
  });

  it("is side-effect free: one GET, no other request", async () => {
    await createTestQueryClient().fetchQuery(shellBadgesOptions());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.body).toBeUndefined();
  });
});

describe("parseBadges", () => {
  it("keeps the counts and the reminder times, dropping junk", async () => {
    const parsed = await parseBadges(
      json({ tareasOpen: 3.7, bandeja: { unreadCount: -2, dueReminders: ["2026-11-08T20:00:00.000Z", 4], renderedAt: 9 } }),
    );
    expect(parsed).toEqual({
      tareasOpen: 3,
      bandeja: { unreadCount: 0, dueReminders: ["2026-11-08T20:00:00.000Z"], renderedAt: 9 },
    });
  });

  it("reads a missing body as zeros", async () => {
    await expect(parseBadges(json(null))).resolves.toEqual({ tareasOpen: 0, bandeja: { unreadCount: 0, dueReminders: [] } });
  });

  it("throws the route's error code on a 401 / 403", async () => {
    await expect(parseBadges(json({ error: "UNAUTHENTICATED" }, 401))).rejects.toThrow("UNAUTHENTICATED");
    await expect(parseBadges(json({ error: "FORBIDDEN" }, 403))).rejects.toThrow("FORBIDDEN");
    await expect(parseBadges(new Response("", { status: 500 }))).rejects.toThrow("HTTP_500");
  });
});

describe("the 60 s badge poll", () => {
  it("refetches every 60 s while the tab is visible and keeps the hydrated counts until then", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    client.setQueryData(qk.shell.badges(), SEED);
    renderWithQueryClient(<Probe />, { client });
    expect(screen.getByTestId("badges").textContent).toBe("4/2");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SHELL_BADGES_REFETCH_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The response body is read and the observers notified a few ticks later.
    await act(() => vi.waitFor(() => expect(screen.getByTestId("badges").textContent).toBe("5/1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SHELL_BADGES_REFETCH_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not poll while the tab is hidden", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    client.setQueryData(qk.shell.badges(), SEED);
    renderWithQueryClient(<Probe />, { client });

    act(() => focusManager.setFocused(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SHELL_BADGES_REFETCH_MS * 3);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("several readers share one entry and one poll", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    client.setQueryData(qk.shell.badges(), SEED);
    renderWithQueryClient(
      <>
        <Probe />
        <Probe />
        <Probe />
      </>,
      { client },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SHELL_BADGES_REFETCH_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("setShellBadgesUnread", () => {
  it("patches the unread count only, clamped at 0", () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.shell.badges(), { ...SEED, bandeja: { ...SEED.bandeja, dueReminders: ["x"] } });
    setShellBadgesUnread(client, 9);
    expect(client.getQueryData(qk.shell.badges())).toEqual({ tareasOpen: 4, bandeja: { unreadCount: 9, dueReminders: ["x"] } });
    setShellBadgesUnread(client, -3);
    expect(client.getQueryData<ShellBadges>(qk.shell.badges())?.bandeja.unreadCount).toBe(0);
  });

  it("does nothing while the badges are not cached", () => {
    const client = createTestQueryClient();
    setShellBadgesUnread(client, 3);
    expect(client.getQueryData(qk.shell.badges())).toBeUndefined();
  });
});
