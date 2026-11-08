// @vitest-environment node
/**
 * Mi espacio query options (Query Migration Phase 7, #941): the notifications
 * refetch contract, the `shell.badges` patch on every notifications fetch,
 * seeding from one page-data call and the cache patches the mutations use.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  fetchNotificationsAction: vi.fn(),
  fetchGmailStatusAction: vi.fn(),
  fetchGmailThreadsAction: vi.fn(),
  fetchGmailThreadAction: vi.fn(),
  fetchRemindersAction: vi.fn(),
  getMiEspacioPageData: vi.fn(),
  fetchMiEspacioNotesPage: vi.fn(),
  fetchMiEspacioChecklistsPage: vi.fn(),
}));
vi.mock("@/lib/actions/notifications-actions", () => ({ fetchNotificationsAction: actions.fetchNotificationsAction }));
vi.mock("@/lib/actions/gmail-actions", () => ({
  fetchGmailStatusAction: actions.fetchGmailStatusAction,
  fetchGmailThreadsAction: actions.fetchGmailThreadsAction,
  fetchGmailThreadAction: actions.fetchGmailThreadAction,
}));
vi.mock("@/lib/actions/my-space-actions", () => ({ fetchRemindersAction: actions.fetchRemindersAction }));
vi.mock("@/lib/actions/page-data/mi-espacio-actions", () => ({
  getMiEspacioPageData: actions.getMiEspacioPageData,
  fetchMiEspacioNotesPage: actions.fetchMiEspacioNotesPage,
  fetchMiEspacioChecklistsPage: actions.fetchMiEspacioChecklistsPage,
}));

import { qk } from "@/lib/query/keys";
import {
  ME_NOTIFICATIONS_REFETCH_MS,
  flattenPages,
  markCachedNotificationsRead,
  meNotificationsOptions,
  meNotesOptions,
  patchCachedGmailThread,
  prefetchMiEspacio,
  seedMiEspacio,
  type GmailThreadsData,
  type NotificationsData,
} from "@/lib/query/options/mi-espacio";
import { createTestQueryClient } from "@/lib/query/test-utils";
import type { MiEspacioPageData } from "@/lib/types/mi-espacio";
import type { NotificationItem } from "@/lib/types/redesign";
import type { ShellBadges } from "@/lib/types/shell";

function item(id: string, readAt: string | null = null): NotificationItem {
  return {
    id,
    kind: "sistema",
    title: id,
    body: "",
    entity: null,
    entityId: null,
    url: null,
    readAt,
    createdAt: "2026-11-07T10:00:00.000Z",
  };
}

const DATA: MiEspacioPageData = {
  notifications: { items: [item("n1"), item("n2")], nextCursor: "c1", unreadCount: 2 },
  gmail: {
    status: { connected: true, scopeOk: true, lastSyncedAt: null, lastError: null },
    threads: [
      {
        id: "t1",
        subject: "Plano",
        from: "Luis <luis@cliente.mx>",
        snippet: "",
        receivedAt: "2026-11-07T10:00:00.000Z",
        unread: true,
        projectId: null,
        suggestedProjectId: null,
      },
    ],
    nextCursor: null,
  },
  reminders: [],
  checklists: [],
  checklistsCursor: null,
  notes: [],
  notesCursor: null,
};

function badges(unreadCount: number): ShellBadges {
  return { tareasOpen: 3, bandeja: { unreadCount } };
}

beforeEach(() => vi.clearAllMocks());

describe("meNotificationsOptions", () => {
  it("refetches every 60 s, only while the page is visible, on the notifications key", () => {
    const options = meNotificationsOptions();
    expect(ME_NOTIFICATIONS_REFETCH_MS).toBe(60_000);
    expect(options.refetchInterval).toBe(60_000);
    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.queryKey).toEqual(qk.me.notifications({}));
  });

  it("every fetch writes its unread count into shell.badges and pages by cursor", async () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.shell.badges(), badges(9));
    actions.fetchNotificationsAction
      .mockResolvedValueOnce({ items: [item("n1")], nextCursor: "c1", unreadCount: 4 })
      .mockResolvedValueOnce({ items: [item("n2")], nextCursor: null, unreadCount: 4 });

    await client.fetchInfiniteQuery(meNotificationsOptions());
    expect(actions.fetchNotificationsAction).toHaveBeenLastCalledWith({});
    expect(client.getQueryData<ShellBadges>(qk.shell.badges())).toEqual(badges(4));

    const observerOptions = meNotificationsOptions();
    const data = client.getQueryData<NotificationsData>(observerOptions.queryKey)!;
    expect(observerOptions.getNextPageParam(data.pages[0]!, data.pages, null, data.pageParams)).toBe("c1");
  });

  it("never creates shell.badges (Phase 2 owns that query)", async () => {
    const client = createTestQueryClient();
    actions.fetchNotificationsAction.mockResolvedValue({ items: [], nextCursor: null, unreadCount: 1 });
    await client.fetchInfiniteQuery(meNotificationsOptions());
    expect(client.getQueryData(qk.shell.badges())).toBeUndefined();
  });
});

describe("seeding", () => {
  it("one page-data call seeds every granular key", async () => {
    const client = createTestQueryClient();
    actions.getMiEspacioPageData.mockResolvedValue(DATA);
    await prefetchMiEspacio(client);
    expect(actions.getMiEspacioPageData).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(qk.me.notifications({}))).toEqual({ pages: [DATA.notifications], pageParams: [null] });
    expect(client.getQueryData(qk.me.gmail.status())).toEqual(DATA.gmail!.status);
    expect(client.getQueryData(qk.me.reminders("today-tomorrow"))).toEqual([]);
    expect(flattenPages(client.getQueryData<{ pages: { items: [] }[] }>(qk.me.notes())?.pages)).toEqual([]);

    // Fresh data: a second hover makes no call.
    await prefetchMiEspacio(client);
    expect(actions.getMiEspacioPageData).toHaveBeenCalledTimes(1);
    // And the seeded keys need no fetch of their own.
    await client.prefetchInfiniteQuery(meNotesOptions());
    expect(actions.fetchMiEspacioNotesPage).not.toHaveBeenCalled();
  });
});

describe("cache patches", () => {
  it("mark-read updates every loaded page and shell.badges", () => {
    const client = createTestQueryClient();
    seedMiEspacio(client, DATA);
    client.setQueryData(qk.shell.badges(), badges(2));

    markCachedNotificationsRead(client, ["n1"], (count) => count - 1);
    const data = client.getQueryData<NotificationsData>(qk.me.notifications({}))!;
    expect(data.pages[0]!.items.find((n) => n.id === "n1")?.readAt).not.toBeNull();
    expect(data.pages[0]!.unreadCount).toBe(1);
    expect(client.getQueryData<ShellBadges>(qk.shell.badges())).toEqual(badges(1));

    markCachedNotificationsRead(client, ["n2"], 0);
    expect(client.getQueryData<ShellBadges>(qk.shell.badges())?.bandeja.unreadCount).toBe(0);
  });

  it("a Gmail patch reaches the list and the open thread", () => {
    const client = createTestQueryClient();
    seedMiEspacio(client, DATA);
    client.setQueryData(qk.me.gmail.thread("t1"), { thread: DATA.gmail!.threads[0], messages: [], attachments: [] });
    patchCachedGmailThread(client, "t1", { unread: false });
    expect(client.getQueryData<GmailThreadsData>(qk.me.gmail.threads())!.pages[0]!.threads[0]!.unread).toBe(false);
    expect(client.getQueryData<{ thread: { unread: boolean } }>(qk.me.gmail.thread("t1"))!.thread.unread).toBe(false);
  });

  it("flattenPages drops repeats across offset pages", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    expect(flattenPages([{ items: [a, b] }, { items: [b] }])).toEqual([a, b]);
  });
});
