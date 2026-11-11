import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { db } from "@/lib/db/client";
import { workflows } from "@/lib/db/schema";
import { loadGmailAccess } from "@/lib/gmail/access";
import { gmailStatusOf, listGmailThreadsPage } from "@/lib/gmail/threads-page";
import { MY_TASK_BUCKETS, sundayOf } from "@/lib/my-space/my-tasks";
import {
  ME_ANALITICO_SEEDED_GROUPS,
  ME_ESENCIAL_LIMITS,
  ME_TASKS_PAGE_SIZE,
  MY_TASKS_ALL,
  meTasksBucketFilters,
  meTasksCommitmentWindow,
  meTasksFirstPageSize,
  meTasksGroupFilters,
  meTasksProjectFilters,
  type MeTasksListFilters,
  type MyTasksSummary,
  type MyTasksSummaryInput,
} from "@/lib/my-space/my-tasks-summary";
import { listChecklistsPage, listNotesPage } from "@/lib/my-space/notes-checklists";
import { listNotificationsPage } from "@/lib/my-space/notifications-page";
import { listReminders } from "@/lib/my-space/reminder-service";
import { todayTomorrowRange } from "@/lib/my-space/today-tomorrow";
import { listTasksPage, myTaskSummary } from "@/lib/repositories/tasks-repository";
import { todayInAppTimeZone } from "@/lib/project-flow/admin-tasks";
import { SIN_TRAMO_KEY } from "@/lib/tareas/summary";
import type { TareasRowsPage } from "@/lib/tareas/page-data";
import type { TaskFilters, TaskKind, ViewerScope } from "@/lib/types/core";
import type { MiEspacioGmail, MiEspacioPageData, MiEspacioTasksSeed } from "@/lib/types/mi-espacio";
import type { PresentationStyle } from "@/lib/types/redesign";

/**
 * Gmail status and the first page of cached threads, with `loadGmailAccess`
 * computed once. Null while the Gmail read is a stub; no threads unless
 * connected with the read scope.
 */
async function loadGmail(staffId: string): Promise<MiEspacioGmail> {
  if (!GMAIL_IMPLEMENTED.fetchGmailStatusAction) return null;
  const access = await loadGmailAccess(db, staffId);
  const status = gmailStatusOf(access);
  if (!status.connected || !status.scopeOk || !GMAIL_IMPLEMENTED.fetchGmailThreadsAction) {
    return { status, threads: [], nextCursor: null };
  }
  try {
    const { threads, nextCursor } = await listGmailThreadsPage(staffId, {});
    return { status, threads, nextCursor };
  } catch {
    // The Bandeja shows the status chip; a load-more retries the read.
    return { status, threads: [], nextCursor: null };
  }
}

// ── My tasks (#1051) ─────────────────────────────────────────────────────────

const ALL_KINDS: TaskKind[] = ["workflow", "usuario", "admin"];

/** My tasks: Responsable or apoyo; an administrator's own admin tasks too (as Tareas "Responsable: Yo"). */
function myTasksScope(user: AuthenticatedUser, viewer: ViewerScope): TaskFilters {
  return { involvesStaffId: user.member.id, ...(viewer.isAdmin ? { kind: ALL_KINDS } : {}) };
}

/** The tramo of a key (`SIN_TRAMO_KEY`: none); null when no live tramo has it (the list is empty). */
async function tramoFilter(key: string | null | undefined): Promise<TaskFilters | null> {
  if (!key) return {};
  if (key === SIN_TRAMO_KEY) return { withoutWorkflow: true };
  const [row] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.key, key), isNull(workflows.deletedAt)))
    .limit(1);
  return row ? { workflowId: row.id } : null;
}

const NO_TRAMO_ID = "00000000-0000-0000-0000-000000000000";

const EMPTY_PAGE: TareasRowsPage = { rows: [], nextCursor: null, total: 0 };

/**
 * `qk.me.tasksSummary(input)` loader: Mi espacio's task counts in one
 * grouped statement (`myTaskSummary`), owner-scoped by the session's staff
 * id. A tramo key no live tramo has narrows to nothing.
 */
export async function loadMyTasksSummary(
  user: AuthenticatedUser,
  input: MyTasksSummaryInput,
  now: Date = new Date(),
): Promise<MyTasksSummary> {
  const viewer = viewerScopeOf(user);
  const today = todayInAppTimeZone(now);
  // A key no live tramo has: an id no task has, so the groups count nothing (the KPIs still count everything).
  const tramo = (await tramoFilter(input.tramo)) ?? { workflowId: NO_TRAMO_ID };
  const commitment = meTasksCommitmentWindow({ ...(input.retraso ? { retraso: true } : {}) }, today);
  const match: TaskFilters = {
    ...tramo,
    ...(input.q ? { search: input.q, searchFolded: true as const } : {}),
    ...(commitment ? { commitment } : {}),
  };
  return myTaskSummary(myTasksScope(user, viewer), match, viewer, { today, sunday: sundayOf(today) });
}

/**
 * `qk.me.tasksList(f)` page loader: my tasks (open ones unless `cerradas`,
 * subtasks as rows), narrowed by project, tramo, search, board column or En
 * retraso, in the "retraso" or "vence" order, `limit` rows after `cursor`
 * (the first page of a board column or an Esencial card is shorter).
 */
export async function loadMyTasksPage(
  user: AuthenticatedUser,
  input: { filters: MeTasksListFilters; cursor: string | null },
  now: Date = new Date(),
): Promise<TareasRowsPage> {
  const viewer = viewerScopeOf(user);
  const f = input.filters;
  const today = todayInAppTimeZone(now);
  const tramo = await tramoFilter(f.tramo);
  if (!tramo) return EMPTY_PAGE;
  const commitment = meTasksCommitmentWindow(f, today);
  const filters: TaskFilters = {
    ...myTasksScope(user, viewer),
    ...tramo,
    ...(f.cerradas ? {} : { mostrar: "abiertas" as const }),
    ...(f.proyecto ? { projectId: f.proyecto } : {}),
    ...(f.q ? { search: f.q, searchFolded: true as const } : {}),
    ...(commitment ? { commitment } : {}),
    today,
  };
  return listTasksPage(filters, viewer, {
    cursor: input.cursor,
    limit: input.cursor ? ME_TASKS_PAGE_SIZE : meTasksFirstPageSize(f),
    orderBy: f.orderBy ?? "retraso",
  });
}

/** What the page seeds for the style it renders: the summary, then the first page of what shows first. */
async function loadMyTasksSeed(
  user: AuthenticatedUser,
  opts: { style?: PresentationStyle; input: MyTasksSummaryInput; withClosed: boolean },
  now: Date,
): Promise<MiEspacioTasksSeed> {
  const summary = await loadMyTasksSummary(user, opts.input, now);
  let lists: MeTasksListFilters[] = [];
  if (opts.style === "visual") lists = MY_TASK_BUCKETS.map(meTasksBucketFilters);
  if (opts.style === "esencial") {
    lists = summary.esencial.slice(0, ME_ESENCIAL_LIMITS.projects).map((p) => meTasksProjectFilters(p.project.id));
  }
  if (opts.style === "analitico") {
    lists = summary.projects
      .flatMap((p) => p.tramos.map((t) => meTasksGroupFilters(opts.input, p.project.id, t.tramo.key, opts.withClosed)))
      .slice(0, ME_ANALITICO_SEEDED_GROUPS);
  }
  const pages = await Promise.all(lists.map((filters) => loadMyTasksPage(user, { filters, cursor: null }, now)));
  return { input: opts.input, summary, lists: lists.map((filters, i) => ({ filters, page: pages[i]! })) };
}

/** The page's view of the tasks: the style it renders and the Analítico filters of the URL. */
export type MiEspacioTasksView = {
  style?: PresentationStyle;
  input?: MyTasksSummaryInput;
  /** The URL's Analítico filters: the counts follow them only when the style is Analítico (`input` wins when set). */
  analiticoInput?: MyTasksSummaryInput;
  withClosed?: boolean;
};

/** The summary input of a view: only Analítico narrows the counts; Visual and Esencial count everything. */
function viewInput(view: MiEspacioTasksView): MyTasksSummaryInput {
  if (view.input) return view.input;
  return view.style === "analitico" && view.analiticoInput ? view.analiticoInput : MY_TASKS_ALL;
}

/**
 * `/mi-espacio` page data (Query Migration Phase 7, #941): `(user) => data`.
 * `getMiEspacioPageData` calls it after the session check and the page
 * prefetch calls it directly; `seedMiEspacio` writes the result into the
 * granular keys (`me.notifications`, `me.gmail.*`, `me.reminders`,
 * `me.checklists`, `me.notes`, `me.tasksSummary`, `me.tasksList`).
 * `canCreateTask` gates the task quick add. The tasks are never read whole
 * (#1051): the summary counts them in SQL and only the first page of what
 * the rendered style shows first comes with it (`view`).
 *
 * Security (plan §4.8 rule 2): every read is owner-scoped by
 * `user.member.id`, so only the viewer's own rows reach the dehydrated HTML.
 * Notes and checklists are bounded first pages; the Gmail payload is cached
 * summaries only (bodies are read live and sanitized by
 * `fetchGmailThreadAction`). Read-only.
 */
export async function loadMiEspacio(
  user: AuthenticatedUser,
  now: Date = new Date(),
  view: MiEspacioTasksView = {},
): Promise<MiEspacioPageData> {
  const staffId = user.member.id;
  const [notifications, gmail, reminders, checklists, notes, tasks] = await Promise.all([
    listNotificationsPage(staffId, {}),
    loadGmail(staffId),
    listReminders(user, todayTomorrowRange(now), now),
    listChecklistsPage(user),
    listNotesPage(user),
    loadMyTasksSeed(
      user,
      { style: view.style, input: viewInput(view), withClosed: view.withClosed ?? false },
      now,
    ),
  ]);
  return {
    notifications,
    gmail,
    reminders,
    checklists: checklists.items,
    checklistsCursor: checklists.nextCursor,
    notes: notes.items,
    notesCursor: notes.nextCursor,
    tasks,
    canCreateTask: resolveActivitiesCapabilities(user).canCreateActivity,
  };
}
