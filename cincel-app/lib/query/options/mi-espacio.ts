import { infiniteQueryOptions, keepPreviousData, queryOptions, type InfiniteData, type QueryClient } from "@tanstack/react-query";

import {
  fetchGmailStatusAction,
  fetchGmailThreadAction,
  fetchGmailThreadsAction,
} from "@/lib/actions/gmail-actions";
import { fetchRemindersAction } from "@/lib/actions/my-space-actions";
import type { TareasRowsPage } from "@/lib/tareas/page-data";
import { fetchMyWeekHoursAction } from "@/lib/actions/time-tracking-actions";
import { fetchNotificationsAction, fetchNotificationsSummaryAction } from "@/lib/actions/notifications-actions";
import {
  fetchMiEspacioChecklistsPage,
  fetchMiEspacioNotesPage,
  getMiEspacioPageData,
  getMyTasksPage,
  getMyTasksSummary,
} from "@/lib/actions/page-data/mi-espacio-actions";
import { sundayOf, type MyTaskBucket } from "@/lib/my-space/my-tasks";
import {
  rowFitsMeList,
  type MeTasksListFilters,
  type MyTasksCounts,
  type MyTasksSummary,
  type MyTasksSummaryInput,
} from "@/lib/my-space/my-tasks-summary";
import { isTaskClosed } from "@/lib/tasks/status-options";
import { todayTomorrowRange } from "@/lib/my-space/today-tomorrow";
import { STALE, qk } from "@/lib/query/keys";
import { setShellBadgesUnread } from "@/lib/query/options/shell";
import type { TaskListItem, TaskListRow } from "@/lib/types/core";
import type { GmailThreadsPage, GmailThreadView, MiEspacioPageData, MySpaceListPage } from "@/lib/types/mi-espacio";
import type {
  Checklist,
  GmailStatus,
  GmailThreadSummary,
  Note,
  NotificationItem,
  NotificationKindSummary,
  NotificationsPage,
  Reminder,
  WeekHours,
} from "@/lib/types/redesign";

/**
 * Mi espacio queries (Query Migration Phase 7, #941). `/mi-espacio` loads in
 * one page-data call (`getMiEspacioPageData`, or the loader on the server)
 * that `seedMiEspacio` writes into the granular keys; each key refetches on
 * its own afterwards. Every query function only reads.
 *
 * - `me.notifications({})`: infinite (cursor pages), refetched every 60 s
 *   while mounted and visible; each fetch writes its `unreadCount` into
 *   `shell.badges`, so the sidebar badge and the Bandeja agree.
 * - `me.gmail.status()`, `me.gmail.threads('')` (infinite), `me.gmail.thread(id)`.
 * - `me.reminders('today-tomorrow')`.
 * - `me.notes()`, `me.checklists()`: infinite bounded pages, 5 min stale;
 *   their mutations patch the cache (optimistic where the issue asks).
 * - `me.tasksSummary(input)`: my task counts (one grouped SQL read, #1051);
 *   `me.tasksList(f)`: one list of my tasks (an Analítico group, a board
 *   column, an Esencial card), 30 a page with "Cargar más". Both sit under
 *   the `me.tasks()` prefix, which every task write invalidates.
 * - `me.weekHours(weekStart)`: one week of my hours (not seeded; the clock
 *   writes invalidate the `me.weekHours()` prefix).
 */

/** `me.notifications` refetch interval while Mi espacio is mounted. */
export const ME_NOTIFICATIONS_REFETCH_MS = 60_000;

/** The Bandeja loads every kind; tabs filter on the client. */
const ALL_NOTIFICATIONS = {} as const;

type PageParam = string | null;

export type NotificationsData = InfiniteData<NotificationsPage, PageParam>;
export type GmailThreadsData = InfiniteData<GmailThreadsPage, PageParam>;
export type NotesData = InfiniteData<MySpaceListPage<Note>, PageParam>;
export type ChecklistsData = InfiniteData<MySpaceListPage<Checklist>, PageParam>;

// ── Options ──────────────────────────────────────────────────────────────────

export function meNotificationsOptions() {
  return infiniteQueryOptions({
    queryKey: qk.me.notifications(ALL_NOTIFICATIONS),
    queryFn: async ({ pageParam, client }) => {
      const page = await fetchNotificationsAction(pageParam ? { cursor: pageParam } : {});
      setShellBadgesUnread(client, page.unreadCount);
      return page;
    },
    initialPageParam: null as PageParam,
    getNextPageParam: (last: NotificationsPage) => last.nextCursor,
    staleTime: STALE.meNotifications,
    refetchInterval: ME_NOTIFICATIONS_REFETCH_MS,
    refetchIntervalInBackground: false,
    // Back on the tab: catch up at once (when stale), as the old visibility poll did.
    refetchOnWindowFocus: true,
  });
}

/**
 * Unread and total per kind (Mi espacio Analítico, "Bandeja por tipo"). The
 * mark-read mutation invalidates it when it settles.
 */
export function meNotificationsSummaryOptions() {
  return queryOptions<NotificationKindSummary[]>({
    queryKey: qk.me.notificationsSummary(),
    queryFn: () => fetchNotificationsSummaryAction(),
    staleTime: STALE.meNotifications,
  });
}

export function meGmailStatusOptions() {
  return queryOptions<GmailStatus>({
    queryKey: qk.me.gmail.status(),
    queryFn: () => fetchGmailStatusAction(),
    staleTime: STALE.screen,
  });
}

export function meGmailThreadsOptions(q = "") {
  return infiniteQueryOptions({
    queryKey: qk.me.gmail.threads(q),
    queryFn: ({ pageParam }) =>
      fetchGmailThreadsAction({ ...(q ? { query: q } : {}), ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: null as PageParam,
    getNextPageParam: (last: GmailThreadsPage) => last.nextCursor,
    staleTime: STALE.screen,
  });
}

/** One thread of the reading pane: a live Gmail read with no side effect (mark-read is a mutation). */
export function meGmailThreadOptions(id: string) {
  return queryOptions<GmailThreadView>({
    queryKey: qk.me.gmail.thread(id),
    queryFn: () => fetchGmailThreadAction(id),
    staleTime: STALE.screen,
  });
}

export function meRemindersOptions() {
  return queryOptions<Reminder[]>({
    queryKey: qk.me.reminders("today-tomorrow"),
    queryFn: () => fetchRemindersAction(todayTomorrowRange(new Date())),
    staleTime: STALE.screen,
  });
}

export function meNotesOptions() {
  return infiniteQueryOptions({
    queryKey: qk.me.notes(),
    queryFn: ({ pageParam }) => fetchMiEspacioNotesPage({ cursor: pageParam }),
    initialPageParam: null as PageParam,
    getNextPageParam: (last: MySpaceListPage<Note>) => last.nextCursor,
    staleTime: STALE.meNotes,
  });
}

export function meChecklistsOptions() {
  return infiniteQueryOptions({
    queryKey: qk.me.checklists(),
    queryFn: ({ pageParam }) => fetchMiEspacioChecklistsPage({ cursor: pageParam }),
    initialPageParam: null as PageParam,
    getNextPageParam: (last: MySpaceListPage<Checklist>) => last.nextCursor,
    staleTime: STALE.meNotes,
  });
}

export type MeTasksListData = InfiniteData<TareasRowsPage, string | null>;

/** My task counts for the Analítico filters (#1051), seeded by the page. */
export function meTasksSummaryOptions(input: MyTasksSummaryInput) {
  return queryOptions<MyTasksSummary>({
    queryKey: qk.me.tasksSummary(input),
    queryFn: () => getMyTasksSummary(input),
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
  });
}

/**
 * One list of my tasks (#1051): 30 a page with "Cargar más" (a board
 * column's or an Esencial card's first page is shorter, the server decides),
 * searched, filtered and ordered on the server. The first pages of what the
 * style shows first come seeded by the page.
 */
export function meTasksListOptions(f: MeTasksListFilters) {
  return infiniteQueryOptions<TareasRowsPage, Error, MeTasksListData, readonly unknown[], string | null>({
    queryKey: qk.me.tasksList(f),
    queryFn: ({ pageParam }) => getMyTasksPage({ filters: f, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
  });
}

/**
 * Every row of `qk.me.tasksList(f)`, page after page, without touching the
 * cache (the loaded groups keep their "Cargar más"): what the CSV export
 * reads, on demand only. Stops after `maxPages`.
 */
export async function fetchAllMeTasksListRows(f: MeTasksListFilters, maxPages = 100): Promise<TaskListRow[]> {
  const rows: TaskListRow[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const page: TareasRowsPage = await getMyTasksPage({ filters: f, cursor });
    rows.push(...page.rows);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

/** One week of my hours; no `weekStart` = this week. */
export function meWeekHoursOptions(weekStart?: string) {
  return queryOptions<WeekHours>({
    queryKey: qk.me.weekHours(weekStart),
    queryFn: () => fetchMyWeekHoursAction(weekStart ? { weekStart } : undefined),
    staleTime: STALE.screen,
  });
}

// ── Seeding ──────────────────────────────────────────────────────────────────

function firstPage<P>(page: P): InfiniteData<P, PageParam> {
  return { pages: [page], pageParams: [null] };
}

/**
 * Writes the page data into the granular keys: on the server before
 * dehydrating (`app/(staff)/mi-espacio/page.tsx`) and on the client after a
 * hover prefetch. `gmail: null` (the Gmail read is a stub) seeds nothing.
 */
export function seedMiEspacio(qc: QueryClient, data: MiEspacioPageData, updatedAt: number = Date.now()): void {
  const at = { updatedAt };
  qc.setQueryData(meNotificationsOptions().queryKey, firstPage(data.notifications), at);
  if (data.gmail) {
    qc.setQueryData(meGmailStatusOptions().queryKey, data.gmail.status, at);
    qc.setQueryData(
      meGmailThreadsOptions().queryKey,
      firstPage({ threads: data.gmail.threads, nextCursor: data.gmail.nextCursor }),
      at,
    );
  }
  qc.setQueryData(meRemindersOptions().queryKey, data.reminders, at);
  qc.setQueryData(meChecklistsOptions().queryKey, firstPage({ items: data.checklists, nextCursor: data.checklistsCursor }), at);
  qc.setQueryData(meNotesOptions().queryKey, firstPage({ items: data.notes, nextCursor: data.notesCursor }), at);
  qc.setQueryData(meTasksSummaryOptions(data.tasks.input).queryKey, data.tasks.summary, at);
  for (const list of data.tasks.lists) qc.setQueryData(meTasksListOptions(list.filters).queryKey, firstPage(list.page), at);
}

/**
 * Client prefetch of Mi espacio (the sidebar hover in Phase 2): one
 * `getMiEspacioPageData` call that seeds every key, skipped while the
 * notifications are still fresh.
 */
export async function prefetchMiEspacio(qc: QueryClient): Promise<void> {
  const state = qc.getQueryState(meNotificationsOptions().queryKey);
  if (state?.status === "success" && Date.now() - state.dataUpdatedAt < STALE.meNotifications) return;
  seedMiEspacio(qc, await getMiEspacioPageData({}));
}

// ── Cache patches ────────────────────────────────────────────────────────────

/** Every item of an infinite list, in page order, without repeats (offset pages can overlap after a write). */
export function flattenPages<T extends { id: string }>(pages: readonly { items: T[] }[] | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

function mapListPages<T>(
  data: InfiniteData<MySpaceListPage<T>, PageParam> | undefined,
  fn: (items: T[], index: number) => T[],
): InfiniteData<MySpaceListPage<T>, PageParam> | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((page, index) => ({ ...page, items: fn(page.items, index) })) };
}

/** Puts `item` first on the first page (replacing a copy anywhere), or seeds a one-page list. */
function insertFirst<T extends { id: string }>(
  data: InfiniteData<MySpaceListPage<T>, PageParam> | undefined,
  item: T,
): InfiniteData<MySpaceListPage<T>, PageParam> {
  if (!data || data.pages.length === 0) return firstPage({ items: [item], nextCursor: null });
  return mapListPages(data, (items, index) => {
    const rest = items.filter((x) => x.id !== item.id);
    return index === 0 ? [item, ...rest] : rest;
  })!;
}

export type Snapshot<D> = { key: readonly unknown[]; data: D | undefined };

async function snapshot<D>(qc: QueryClient, key: readonly unknown[]): Promise<Snapshot<D>> {
  await qc.cancelQueries({ queryKey: key });
  return { key, data: qc.getQueryData<D>(key) };
}

/** Restores what `snapshot` saved (a mutation's rollback). */
export function restoreSnapshot<D>(qc: QueryClient, snap: Snapshot<D>): void {
  qc.setQueryData(snap.key, snap.data);
}

// My tasks (#1051)

const ME_TASK_LISTS = ["me", "tasks", "list"] as const;

/** The list filters of a `qk.me.tasksList(f)` key. */
function listFiltersOf(key: readonly unknown[]): MeTasksListFilters {
  return (key[3] ?? {}) as MeTasksListFilters;
}

/** Every cached list of my tasks, to put back when a write fails. */
export async function snapshotMeTaskLists(qc: QueryClient): Promise<[readonly unknown[], MeTasksListData | undefined][]> {
  await qc.cancelQueries({ queryKey: ME_TASK_LISTS });
  return qc.getQueriesData<MeTasksListData>({ queryKey: ME_TASK_LISTS });
}

export function restoreMeTaskLists(qc: QueryClient, snap: [readonly unknown[], MeTasksListData | undefined][]): void {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

/** The loaded row of a task in any list of mine, or undefined. */
export function findMeTaskRow(qc: QueryClient, id: string): TaskListRow | undefined {
  for (const [, data] of qc.getQueriesData<MeTasksListData>({ queryKey: ME_TASK_LISTS })) {
    for (const page of data?.pages ?? []) {
      const row = page.rows.find((r) => r.id === id);
      if (row) return row;
    }
  }
  return undefined;
}

function mapListRows(data: MeTasksListData | undefined, fn: (rows: TaskListRow[]) => TaskListRow[]): MeTasksListData | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((page) => ({ ...page, rows: fn(page.rows) })) };
}

/**
 * Patches one task in every loaded list of mine. A task that closes leaves
 * the open lists (the lists with `cerradas` keep it, muted); `null` removes
 * it everywhere (deleted). The lists' totals follow, so "Cargar más (n)"
 * stays right until the refetch.
 */
export function patchMeTaskRows(qc: QueryClient, id: string, fn: (row: TaskListRow) => TaskListRow | null): void {
  for (const [key, data] of qc.getQueriesData<MeTasksListData>({ queryKey: ME_TASK_LISTS })) {
    if (!data?.pages.some((page) => page.rows.some((r) => r.id === id))) continue;
    const f = listFiltersOf(key);
    let removed = false;
    const next = mapListRows(data, (rows) =>
      rows.flatMap((row) => {
        if (row.id !== id) return [row];
        const patched = fn(row);
        if (patched === null || (!f.cerradas && isTaskClosed(patched))) {
          removed = true;
          return [];
        }
        return [patched];
      }),
    );
    qc.setQueryData(key, removed && next ? { ...next, pages: next.pages.map((p) => ({ ...p, total: Math.max(0, p.total - 1) })) } : next);
  }
}

const ME_TASK_SUMMARIES = ["me", "tasks", "summary"] as const;

export type MeTasksSummarySnapshot = [readonly unknown[], MyTasksSummary | undefined][];

/** Every cached summary of my tasks, to put back when a write fails. */
export async function snapshotMeTasksSummaries(qc: QueryClient): Promise<MeTasksSummarySnapshot> {
  await qc.cancelQueries({ queryKey: ME_TASK_SUMMARIES });
  return qc.getQueriesData<MyTasksSummary>({ queryKey: ME_TASK_SUMMARIES });
}

export function restoreMeTasksSummaries(qc: QueryClient, snap: MeTasksSummarySnapshot): void {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

/**
 * Moves one task between open and closed (or in and out of blocked) in
 * every cached summary of mine, so the KPIs, chips, columns and group
 * headers follow a status edit before the refetch. The parts the filters
 * narrow (`shown`, the Analítico groups) are patched only in the summaries
 * whose filters the client can check (no search); the refetch settles the
 * rest, and the Esencial cards' nearest date. A change that is neither is
 * left to the refetch.
 */
export function patchMeTasksSummaryStatus(qc: QueryClient, before: TaskListRow, after: TaskListRow): void {
  const wasOpen = !isTaskClosed(before);
  const isOpen = !isTaskClosed(after);
  const wasBlocked = wasOpen && before.status === "bloqueado";
  const isBlocked = isOpen && after.status === "bloqueado";
  if (wasOpen === isOpen && wasBlocked === isBlocked) return;
  const open = (isOpen ? 1 : 0) - (wasOpen ? 1 : 0);
  const blocked = (isBlocked ? 1 : 0) - (wasBlocked ? 1 : 0);
  const etapaId = before.workflowId ?? null;
  const etapaKey = before.workflow?.key ?? null;
  for (const [key, summary] of qc.getQueriesData<MyTasksSummary>({ queryKey: ME_TASK_SUMMARIES })) {
    if (!summary || !summary.today) continue;
    const input = (key[3] ?? {}) as MyTasksSummaryInput;
    const today = summary.today;
    const due = before.commitmentDate ? before.commitmentDate.slice(0, 10) : null;
    const overdue = due !== null && due < today ? open : 0;
    const daysLate = overdue !== 0 ? Math.round((Date.parse(today) - Date.parse(due!)) / 86_400_000) : 0;
    const sunday = sundayOf(today);
    const bucket: MyTaskBucket = due !== null && due <= today ? "hoy" : due !== null && due <= sunday ? "semana" : "despues";
    const counts = <C extends MyTasksCounts>(c: C): C => {
      const lateCount = Math.max(0, c.overdue + overdue);
      // The max of the others is unknown when the latest one closes: the refetch settles it.
      const maxDaysLate = lateCount === 0 ? 0 : overdue > 0 ? Math.max(c.maxDaysLate, daysLate) : c.maxDaysLate;
      return {
        ...c,
        open: Math.max(0, c.open + open),
        overdue: lateCount,
        blocked: Math.max(0, c.blocked + blocked),
        daysLateSum: Math.max(0, c.daysLateSum + overdue * daysLate),
        maxDaysLate,
        closed: Math.max(0, c.closed - open),
      };
    };
    const all = {
      ...summary.all,
      open: Math.max(0, summary.all.open + open),
      overdue: Math.max(0, summary.all.overdue + overdue),
      dueToday: Math.max(0, summary.all.dueToday + (due === today ? open : 0)),
      buckets: { ...summary.all.buckets, [bucket]: Math.max(0, summary.all.buckets[bucket] + open) },
    };
    const etapas = summary.etapas.map((t) => (t.id === etapaId ? { ...t, open: Math.max(0, t.open + open) } : t));
    const esencial = summary.esencial.map((e) =>
      e.project.id === before.projectId
        ? { ...e, open: Math.max(0, e.open + open), overdue: Math.max(0, e.overdue + overdue) }
        : e,
    );
    const matches =
      !input.q &&
      (input.etapa === null || input.etapa === undefined || input.etapa === etapaKey) &&
      (!input.retraso || (due !== null && due < today));
    const next: MyTasksSummary = matches
      ? {
          ...summary,
          all,
          etapas,
          esencial,
          shown: counts(summary.shown),
          projects: summary.projects.map((p) =>
            p.project.id === before.projectId
              ? { ...counts(p), etapas: p.etapas.map((t) => (t.etapa.id === etapaId ? counts(t) : t)) }
              : p,
          ),
        }
      : { ...summary, all, etapas, esencial };
    qc.setQueryData(key, next);
  }
}

/** A task detail or list item as a list row (the counts it has; the refetch fills the rest). */
export function meTaskRowOf(item: TaskListItem): TaskListRow {
  const { notes: _notes, ...rest } = item;
  void _notes;
  return {
    ...rest,
    subtaskDone: item.subtaskDoneCount,
    commentCount: 0,
    attachmentCount: 0,
    checklistTotal: item.checklist.total,
    checklistDone: item.checklist.completed,
  };
}

/**
 * Adds a task (created or reopened here) to the end of the loaded lists of
 * mine it fits (project, etapa, board column); the refetch puts it in its
 * server place.
 */
export function insertMeTaskRow(qc: QueryClient, item: TaskListItem, today: string): void {
  const row = meTaskRowOf(item);
  for (const [key, data] of qc.getQueriesData<MeTasksListData>({ queryKey: ME_TASK_LISTS })) {
    if (!data || data.pages.length === 0) continue;
    if (data.pages.some((page) => page.rows.some((r) => r.id === row.id))) continue;
    if (!rowFitsMeList(listFiltersOf(key), row, today)) continue;
    const last = data.pages.length - 1;
    qc.setQueryData<MeTasksListData>(key, {
      ...data,
      pages: data.pages.map((page, i) => ({
        ...page,
        total: page.total + 1,
        rows: i === last ? [...page.rows, row] : page.rows,
      })),
    });
  }
}

// Notes

export function snapshotNotes(qc: QueryClient): Promise<Snapshot<NotesData>> {
  return snapshot<NotesData>(qc, qk.me.notes());
}

export function upsertCachedNote(qc: QueryClient, note: Note): void {
  qc.setQueryData<NotesData>(qk.me.notes(), (old) => {
    const exists = flattenPages(old?.pages).some((n) => n.id === note.id);
    return exists ? mapListPages(old, (items) => items.map((n) => (n.id === note.id ? note : n))) : insertFirst(old, note);
  });
}

export function patchCachedNote(qc: QueryClient, id: string, patch: Partial<Note>): void {
  qc.setQueryData<NotesData>(qk.me.notes(), (old) =>
    mapListPages(old, (items) => items.map((n) => (n.id === id ? { ...n, ...patch } : n))),
  );
}

export function removeCachedNote(qc: QueryClient, id: string): void {
  qc.setQueryData<NotesData>(qk.me.notes(), (old) => mapListPages(old, (items) => items.filter((n) => n.id !== id)));
}

// Checklists

export function snapshotChecklists(qc: QueryClient): Promise<Snapshot<ChecklistsData>> {
  return snapshot<ChecklistsData>(qc, qk.me.checklists());
}

export function insertCachedChecklist(qc: QueryClient, checklist: Checklist): void {
  qc.setQueryData<ChecklistsData>(qk.me.checklists(), (old) => insertFirst(old, checklist));
}

/** Patches one cached checklist; a patched checklist was just changed, so its `updatedAt` becomes now. */
export function updateCachedChecklist(qc: QueryClient, id: string, fn: (checklist: Checklist) => Checklist): void {
  const updatedAt = new Date().toISOString();
  qc.setQueryData<ChecklistsData>(qk.me.checklists(), (old) =>
    mapListPages(old, (items) => items.map((c) => (c.id === id ? { ...fn(c), updatedAt } : c))),
  );
}

// Notifications

export function snapshotNotifications(qc: QueryClient): Promise<Snapshot<NotificationsData>> {
  return snapshot<NotificationsData>(qc, qk.me.notifications(ALL_NOTIFICATIONS));
}

/**
 * Marks rows read in every loaded page and sets the unread count, also into
 * `shell.badges`. `unreadCount` is the server's count (a result) or a change
 * of the cached one (an optimistic step).
 */
export function markCachedNotificationsRead(
  qc: QueryClient,
  ids: readonly string[] | "all",
  unreadCount: number | ((current: number) => number),
): void {
  const key = qk.me.notifications(ALL_NOTIFICATIONS);
  const old = qc.getQueryData<NotificationsData>(key);
  const current = old?.pages[0]?.unreadCount ?? 0;
  const count = Math.max(0, typeof unreadCount === "function" ? unreadCount(current) : unreadCount);
  if (old) {
    const readAt = new Date().toISOString();
    const hit = (item: NotificationItem) => item.readAt === null && (ids === "all" || ids.includes(item.id));
    qc.setQueryData<NotificationsData>(key, {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        unreadCount: count,
        items: page.items.map((item) => (hit(item) ? { ...item, readAt } : item)),
      })),
    });
  }
  if (old || typeof unreadCount === "number") setShellBadgesUnread(qc, count);
}

/** The unread count of the cached Bandeja (first page), or null before it loads. */
export function cachedUnreadCount(qc: QueryClient): number | null {
  return qc.getQueryData<NotificationsData>(qk.me.notifications(ALL_NOTIFICATIONS))?.pages[0]?.unreadCount ?? null;
}

// Gmail

export function snapshotGmailThreads(qc: QueryClient): Promise<Snapshot<GmailThreadsData>> {
  return snapshot<GmailThreadsData>(qc, qk.me.gmail.threads());
}

/** Patches one thread in the cached list and in its reading-pane query. */
export function patchCachedGmailThread(qc: QueryClient, id: string, patch: Partial<GmailThreadSummary>): void {
  qc.setQueryData<GmailThreadsData>(qk.me.gmail.threads(), (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            threads: page.threads.map((t) => (t.id === id ? { ...t, ...patch } : t)),
          })),
        }
      : old,
  );
  qc.setQueryData<GmailThreadView>(qk.me.gmail.thread(id), (old) =>
    old ? { ...old, thread: { ...old.thread, ...patch } } : old,
  );
}
