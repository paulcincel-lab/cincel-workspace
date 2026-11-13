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
  getMyTasksSummary: vi.fn(),
  getMyTasksPage: vi.fn(),
  fetchMyWeekHoursAction: vi.fn(),
}));
vi.mock("@/lib/actions/time-tracking-actions", () => ({ fetchMyWeekHoursAction: actions.fetchMyWeekHoursAction }));
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
  getMyTasksSummary: actions.getMyTasksSummary,
  getMyTasksPage: actions.getMyTasksPage,
}));

import { qk } from "@/lib/query/keys";
import {
  ME_NOTIFICATIONS_REFETCH_MS,
  flattenPages,
  markCachedNotificationsRead,
  meNotificationsOptions,
  meNotesOptions,
  insertMeTaskRow,
  meTaskRowOf,
  meTasksListOptions,
  meTasksSummaryOptions,
  meWeekHoursOptions,
  patchMeTaskRows,
  patchMeTasksSummaryStatus,
  type MeTasksListData,
  patchCachedGmailThread,
  prefetchMiEspacio,
  seedMiEspacio,
  type GmailThreadsData,
  type NotificationsData,
} from "@/lib/query/options/mi-espacio";
import { createTestQueryClient } from "@/lib/query/test-utils";
import { fakeMyTasks } from "@/tests/helpers/my-tasks-fake";
import type { MyTasksSummary } from "@/lib/my-space/my-tasks-summary";
import { EMPTY_MY_TASKS_SUMMARY, MY_TASKS_ALL, meTasksBucketFilters, meTasksGroupFilters } from "@/lib/my-space/my-tasks-summary";
import type { MiEspacioPageData } from "@/lib/types/mi-espacio";
import type { TaskListItem } from "@/lib/types/core";
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
  tasks: {
    input: MY_TASKS_ALL,
    summary: { ...EMPTY_MY_TASKS_SUMMARY, today: "2026-11-09" },
    lists: [{ filters: meTasksBucketFilters("hoy"), page: { rows: [], nextCursor: null, total: 0 } }],
  },
  canCreateTask: true,
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

describe("me.tasks (#1051)", () => {
  it("seedMiEspacio seeds the summary and the first pages; nothing reads every task", async () => {
    const client = createTestQueryClient();
    seedMiEspacio(client, DATA);
    expect(client.getQueryData(qk.me.tasksSummary(MY_TASKS_ALL))).toEqual(DATA.tasks.summary);
    expect(client.getQueryData(qk.me.tasksList(meTasksBucketFilters("hoy")))).toEqual({
      pages: [DATA.tasks.lists[0]!.page],
      pageParams: [null],
    });
    // Seeded: no request of its own on the first render.
    await client.prefetchQuery(meTasksSummaryOptions(MY_TASKS_ALL));
    await client.prefetchInfiniteQuery(meTasksListOptions(meTasksBucketFilters("hoy")));
    expect(actions.getMyTasksSummary).not.toHaveBeenCalled();
    expect(actions.getMyTasksPage).not.toHaveBeenCalled();
    // Both live under the `me.tasks` prefix every task write invalidates.
    expect(meTasksSummaryOptions(MY_TASKS_ALL).queryKey.slice(0, 2)).toEqual(qk.me.tasks());
    expect(meTasksListOptions(meTasksBucketFilters("hoy")).queryKey.slice(0, 2)).toEqual(qk.me.tasks());
  });

  it("pages by cursor with the list filters", async () => {
    const client = createTestQueryClient();
    const f = meTasksGroupFilters(MY_TASKS_ALL, "p1", "diseno", false);
    actions.getMyTasksPage.mockResolvedValue({ rows: [], nextCursor: "c1", total: 40 });
    await client.fetchInfiniteQuery(meTasksListOptions(f));
    expect(actions.getMyTasksPage).toHaveBeenLastCalledWith({ filters: f, cursor: null });
    const options = meTasksListOptions(f);
    const data = client.getQueryData<MeTasksListData>(options.queryKey)!;
    expect(options.getNextPageParam(data.pages[0]!, data.pages, null, data.pageParams)).toBe("c1");
    await options.queryFn!({ pageParam: "c1", queryKey: options.queryKey, signal: new AbortController().signal, meta: undefined, client, direction: "forward" } as never);
    expect(actions.getMyTasksPage).toHaveBeenLastCalledWith({ filters: f, cursor: "c1" });
  });

  it("patchMeTaskRows edits a row in every list; a closed task leaves the open lists only", () => {
    const client = createTestQueryClient();
    const row = meTaskRowOf({
      id: "k1",
      title: "Planos",
      status: "pendiente",
      customStatus: null,
      checklist: { total: 0, completed: 0 },
      subtaskDoneCount: 0,
      notes: null,
    } as unknown as TaskListItem);
    const open = qk.me.tasksList(meTasksGroupFilters(MY_TASKS_ALL, "p1", "diseno", false));
    const all = qk.me.tasksList(meTasksGroupFilters(MY_TASKS_ALL, "p1", "diseno", true));
    for (const key of [open, all]) client.setQueryData(key, { pages: [{ rows: [row], nextCursor: null, total: 1 }], pageParams: [null] });

    patchMeTaskRows(client, "k1", (r) => ({ ...r, title: "Planos v2" }));
    expect(client.getQueryData<MeTasksListData>(open)!.pages[0]!.rows[0]!.title).toBe("Planos v2");

    patchMeTaskRows(client, "k1", (r) => ({ ...r, status: "completado" }));
    expect(client.getQueryData<MeTasksListData>(open)!.pages[0]).toMatchObject({ rows: [], total: 0 });
    expect(client.getQueryData<MeTasksListData>(all)!.pages[0]!.rows[0]!.status).toBe("completado");

    patchMeTaskRows(client, "k1", () => null);
    expect(client.getQueryData<MeTasksListData>(all)!.pages[0]).toMatchObject({ rows: [], total: 0 });
  });

  it("patchMeTasksSummaryStatus moves a closed or reopened task in every cached summary", () => {
    const today = "2026-11-10";
    const task = (id: string, extra: Partial<TaskListItem>) =>
      ({
        id,
        title: id,
        projectId: "p1",
        project: { id: "p1", name: "Casa Lomas" },
        workflow: { id: "w1", key: "diseno", name: "Diseño", sortOrder: 1 },
        workflowId: "w1",
        status: "pendiente",
        customStatus: null,
        archived: false,
        commitmentDate: null,
        checklist: { total: 0, completed: 0 },
        subtaskDoneCount: 0,
        notes: null,
        ...extra,
      }) as unknown as TaskListItem;
    const fake = fakeMyTasks(
      [
        task("late", { commitmentDate: "2026-11-07", status: "bloqueado" }),
        task("hoy", { commitmentDate: today }),
        task("libre", {}),
      ],
      today,
    );
    const client = createTestQueryClient();
    const plain = qk.me.tasksSummary(MY_TASKS_ALL);
    const searched = qk.me.tasksSummary({ etapa: null, q: "late" });
    client.setQueryData(plain, fake.summary(MY_TASKS_ALL));
    client.setQueryData(searched, fake.summary({ etapa: null, q: "late" }));

    const before = meTaskRowOf(fake.tasks[0]!);
    const after = { ...before, status: "completado" as const };
    // The Esencial cards' nearest date is left to the refetch.
    const counted = (summary: MyTasksSummary | undefined) => ({
      ...summary!,
      esencial: summary!.esencial.map(({ nearestDue: _nearest, ...rest }) => rest),
    });
    patchMeTasksSummaryStatus(client, before, after);
    fake.tasks[0] = { ...fake.tasks[0]!, status: "completado" };
    expect(counted(client.getQueryData<MyTasksSummary>(plain))).toEqual(counted(fake.summary(MY_TASKS_ALL)));
    // A searched summary: the filter-free counts follow, the rest waits for the refetch.
    expect(client.getQueryData<MyTasksSummary>(searched)!.all).toEqual(fake.summary(MY_TASKS_ALL).all);

    patchMeTasksSummaryStatus(client, after, before);
    fake.tasks[0] = { ...fake.tasks[0]!, status: "bloqueado" };
    expect(counted(client.getQueryData<MyTasksSummary>(plain))).toEqual(counted(fake.summary(MY_TASKS_ALL)));
  });

  it("insertMeTaskRow adds a created task to the loaded lists it fits", () => {
    const client = createTestQueryClient();
    const hoy = qk.me.tasksList(meTasksBucketFilters("hoy"));
    const semana = qk.me.tasksList(meTasksBucketFilters("semana"));
    for (const key of [hoy, semana]) client.setQueryData(key, { pages: [{ rows: [], nextCursor: null, total: 0 }], pageParams: [null] });
    insertMeTaskRow(
      client,
      {
        id: "n1",
        projectId: "p1",
        workflow: null,
        commitmentDate: "2026-11-09",
        checklist: { total: 0, completed: 0 },
        subtaskDoneCount: 0,
        notes: null,
      } as unknown as TaskListItem,
      "2026-11-09",
    );
    expect(client.getQueryData<MeTasksListData>(hoy)!.pages[0]).toMatchObject({ total: 1 });
    expect(client.getQueryData<MeTasksListData>(hoy)!.pages[0]!.rows.map((r) => r.id)).toEqual(["n1"]);
    expect(client.getQueryData<MeTasksListData>(semana)!.pages[0]!.rows).toEqual([]);
  });

  it("meWeekHoursOptions keys one week under the me.weekHours prefix", async () => {
    const client = createTestQueryClient();
    actions.fetchMyWeekHoursAction.mockResolvedValue({ days: [], total: 0, target: 40 });
    expect(meWeekHoursOptions("2026-11-02").queryKey).toEqual(["me", "week-hours", "2026-11-02"]);
    await client.fetchQuery(meWeekHoursOptions("2026-11-02"));
    expect(actions.fetchMyWeekHoursAction).toHaveBeenCalledWith({ weekStart: "2026-11-02" });
    await client.fetchQuery(meWeekHoursOptions());
    expect(actions.fetchMyWeekHoursAction).toHaveBeenLastCalledWith(undefined);
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
