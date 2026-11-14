"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, Lock, Zap } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode, type RefObject } from "react";

import { ChecklistCard } from "@/components/mi-espacio/ChecklistCard";
import { Inbox } from "@/components/mi-espacio/Inbox";
import { QuickCapture } from "@/components/mi-espacio/QuickCapture";
import {
  ABIERTOS_PARAM,
  ESTADO_PARAM,
  ESTADO_RETRASO,
  SEARCH_PARAM,
  ETAPA_PARAM,
  abiertosParam,
  parseMiEspacioFilters,
  replaceMiEspacioParam,
} from "@/components/mi-espacio/search-params";
import { EmptyState } from "@/components/shell/EmptyState";
import { ErrorState } from "@/components/shell/ErrorState";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { newTaskInvalidations } from "@/components/tareas/NewTaskDialog";
import { TaskSheetRoute, taskSheetHref } from "@/components/tareas/TaskSheet";
import { deleteTargetOf, useDeleteTasks } from "@/components/tareas/use-delete-tasks";
import { TaskBulkBar } from "@/components/tareas/TaskBulkBar";
import { useTaskSelection } from "@/components/tareas/use-task-selection";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { FilterCard, type FilterGroup } from "@/components/widgets/FilterCard";
import { GroupedTable, type Group } from "@/components/widgets/GroupedTable";
import { HiddenCompletedLine, HideCompletedSwitch } from "@/components/widgets/HideCompletedSwitch";
import { useHideCompletedTasks } from "@/components/tareas/use-hide-completed";
import { KpiStrip, type KpiStripItem } from "@/components/widgets/KpiStrip";
import { MI_ESPACIO_COMMIT_KEYS, miEspacioTaskColumns } from "@/components/widgets/mi-espacio-task-columns";
import { PeopleStack } from "@/components/widgets/PeopleStack";
import { TASK_SUPPORT_COLUMN } from "@/components/tareas/task-cell-edits";
import { SUPPORT_COLUMN_LABEL } from "@/components/tareas/task-table-copy";
import { PageHeader } from "@/components/widgets/PageHeader";
import { QuickAddRow, type QuickAddCreated, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { createChecklistAction } from "@/lib/actions/my-space-actions";
import { IMPLEMENTED as MY_SPACE } from "@/lib/actions/my-space-actions.flags";
import { IMPLEMENTED as NOTIFICATIONS_IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import { createUserTaskAction } from "@/lib/actions/tasks-actions";
import { IMPLEMENTED as TIME_TRACKING } from "@/lib/actions/time-tracking-actions.flags";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { actionErrorText } from "@/lib/errors";
import { INBOX_TAB_PARAM, type InboxTab } from "@/lib/my-space/inbox";
import {
  DAYS_LATE_WARN,
  checklistMetrics,
  checklistPct,
  clockTime,
  miEspacioCsv,
  miEspacioCsvFileName,
  shortDate,
  taskRow,
  timeAgo,
  etapaGroupId,
  type TaskRow,
} from "@/lib/my-space/my-tasks";
import {
  EMPTY_MY_TASKS_SUMMARY,
  groupRowCount,
  meTasksGroupFilters,
  myTasksSummaryGroups,
  myTasksSummaryInput,
  shownMetrics,
  type MeTasksListFilters,
} from "@/lib/my-space/my-tasks-summary";
import { useActionMutation } from "@/lib/query/mutation";
import { catalogOptions } from "@/lib/query/options/catalog";
import { meTodayOptions } from "@/lib/query/options/me";
import {
  flattenPages,
  insertCachedChecklist,
  meChecklistsOptions,
  meGmailStatusOptions,
  meGmailThreadsOptions,
  meNotificationsOptions,
  meNotificationsSummaryOptions,
  insertMeTaskRow,
  fetchAllMeTasksListRows,
  meTasksListOptions,
  meTasksSummaryOptions,
  meWeekHoursOptions,
} from "@/lib/query/options/mi-espacio";
import { listItemOfRow } from "@/lib/tareas/page-data";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { isTaskClosed, statusColorToken, statusDotClass } from "@/lib/tasks/status-options";
import { addDays, localDate, mondayOf } from "@/lib/time-tracking/local-time";
import { etapaColorVar } from "@/lib/etapas/etapa-color";
import type { TaskDetail, TaskListItem, TaskListRow } from "@/lib/types/core";
import type {
  Checklist,
  GmailThreadSummary,
  NotificationItem,
  NotificationKind,
  NotificationKindSummary,
  WeekHours,
} from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

/**
 * Mi espacio, Analítico (frame `MiEspacio-Analitico`): header, filters, five
 * KPIs, the "Ir a" anchors, then Mis tareas (project → etapa table with quick
 * add per project), Horas de la semana and Bandeja por tipo side by side, and
 * Checklists. Every figure comes from the `me.*` queries; filters, search and
 * the expanded projects live in the URL (`?estado=`, `?etapa=`, `?q=`,
 * `?abiertos=`). Owner-only: every read takes the staff id from the session.
 */
export type MiEspacioAnaliticoProps = {
  /** The `?nota=` not-found notice of the page, under the header. */
  notice?: ReactNode;
  /** The `?correo=` Gmail reader, under the tables. */
  reader?: ReactNode;
};

export const MI_ESPACIO_ANALITICO_DESCRIPTION = "Tus tareas, horas, bandeja y checklists, con números.";
export const SECTION_ERROR = "No pudimos cargar esta sección.";
export const NO_MATCH = "Nada coincide con estos filtros.";
export const CLEAR_FILTERS = "Quitar filtros";

type SectionKey = "tareas" | "horas" | "bandeja" | "checklists";
const SECTIONS: readonly SectionKey[] = ["tareas", "horas", "bandeja", "checklists"];
const ALL_OPEN: Record<SectionKey, boolean> = { tareas: true, horas: true, bandeja: true, checklists: true };

/** Bandeja rows: order and labels of the kinds. */
export const BANDEJA_KINDS: readonly { kind: NotificationKind; label: string }[] = [
  { kind: "asignacion", label: "Asignaciones" },
  { kind: "mencion", label: "Menciones" },
  { kind: "comentario", label: "Comentarios" },
  { kind: "vencimiento", label: "Vencimientos" },
  { kind: "aprobacion_cliente", label: "Aprobaciones del cliente" },
  { kind: "recordatorio", label: "Recordatorios" },
  { kind: "sistema", label: "Sistema" },
];

// Analítico kit cells (frame tokens).
const TH = "h-auto bg-muted px-3 py-2 font-mono text-[11px] font-medium tracking-[.08em] whitespace-nowrap text-muted-foreground uppercase";
const TD = "border-b border-accent px-3 py-[7px] text-[12.5px] whitespace-nowrap";
const TF = "bg-muted px-3 py-2 text-[12.5px] font-semibold whitespace-nowrap";
const STICKY = "sticky left-0 z-[1] bg-card";
const STICKY_MUTED = "sticky left-0 z-[1] bg-muted";
const WARN = "bg-warning/15 text-warning-ink";

const NUMBER = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });
const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "39.5". */
function hoursText(value: number): string {
  return NUMBER.format(Math.round(value * 10) / 10);
}

/** "+0.5", "−0.5" (U+2212) or "0". */
function signedText(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0";
  return rounded > 0 ? `+${NUMBER.format(rounded)}` : `−${NUMBER.format(-rounded)}`;
}

/** Lower case without accents, for the search. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function matches(text: string, q: string): boolean {
  return q === "" || fold(text).includes(q);
}

/** "hoy 9:12", "ayer 18:00", else "7 nov" (org time). */
export function latestLabel(iso: string | null, now: Date): string {
  if (!iso) return "—";
  const day = localDate(new Date(iso));
  const today = localDate(now);
  if (day === today) return `hoy ${clockTime(iso)}`;
  if (day === addDays(today, -1)) return `ayer ${clockTime(iso)}`;
  return shortDate(day);
}

/** "2–8 nov" or "27 oct–2 nov": Monday to Sunday. */
function weekRangeText(monday: string): string {
  const sunday = addDays(monday, 6);
  const [d1, m1] = shortDate(monday).split(" ");
  const [, m2] = shortDate(sunday).split(" ");
  return m1 === m2 ? `${d1}–${shortDate(sunday)}` : `${shortDate(monday)}–${shortDate(sunday)}`;
}

/** "Lun 2 nov". */
function dayLabel(date: string): string {
  return `${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${shortDate(date)}`;
}

function hasHours(week: WeekHours | undefined): boolean {
  return (week?.days ?? []).some((day) => day.hours > 0);
}

/** A task detail as the list item it becomes (`me.tasksList` rows). */
function listItemOfDetail(detail: TaskDetail): TaskListItem {
  const { createdBy: _c, checklistItems: _i, attachments: _a, links: _l, history: _h, ...item } = detail;
  void _c;
  void _i;
  void _a;
  void _l;
  void _h;
  return item;
}

export type BandejaRow = {
  key: string;
  label: string;
  tab: InboxTab;
  unread: number;
  /** null = unknown ("—", Gmail). */
  total: number | null;
  latestAt: string | null;
};

function inboxTabOf(kind: NotificationKind): InboxTab {
  return kind === "mencion" ? "menciones" : "notificaciones";
}

/**
 * Bandeja por tipo rows: the summary per kind in `BANDEJA_KINDS` order (total
 * 0 hidden), plus "Correo" from the loaded Gmail page when connected.
 */
export function bandejaRows(
  summary: readonly NotificationKindSummary[],
  threads: readonly GmailThreadSummary[] | null,
): BandejaRow[] {
  const byKind = new Map(summary.map((row) => [row.kind, row]));
  const rows: BandejaRow[] = [];
  for (const { kind, label } of BANDEJA_KINDS) {
    const row = byKind.get(kind);
    if (!row || row.total === 0) continue;
    rows.push({ key: kind, label, tab: inboxTabOf(kind), unread: row.unread, total: row.total, latestAt: row.latestAt });
  }
  if (threads && threads.length > 0) {
    const latest = threads.reduce((max, t) => (Date.parse(t.receivedAt) > Date.parse(max) ? t.receivedAt : max), threads[0]!.receivedAt);
    rows.push({ key: "gmail", label: "Correo", tab: "gmail", unread: threads.filter((t) => t.unread).length, total: null, latestAt: latest });
  }
  return rows;
}

/** Summary rows of the loaded notifications (the search narrows the Bandeja to matching titles). */
function summaryOfItems(items: readonly NotificationItem[]): NotificationKindSummary[] {
  const byKind = new Map<NotificationKind, NotificationKindSummary>();
  for (const item of items) {
    const row = byKind.get(item.kind) ?? { kind: item.kind, unread: 0, total: 0, latestAt: null };
    row.total += 1;
    if (item.readAt === null) row.unread += 1;
    if (!row.latestAt || Date.parse(item.createdAt) > Date.parse(row.latestAt)) row.latestAt = item.createdAt;
    byKind.set(item.kind, row);
  }
  return [...byKind.values()];
}

function downloadText(text: string, fileName: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ── Page ──────────────────────────────────────────────────────────────────

export function MiEspacioAnalitico({ notice, reader }: MiEspacioAnaliticoProps) {
  const searchParams = useSearchParams();
  const filters = parseMiEspacioFilters(searchParams);
  const search = searchParams?.toString() ?? "";
  const q = fold(filters.q.trim());
  const now = new Date();
  const today = useMemo(() => localDate(new Date()), []);

  const user = useSessionStore(selectAuthenticatedUser);
  const viewerId = user?.member.id ?? null;
  const capabilities = resolveActivitiesCapabilities(user);
  const canCreateTask = capabilities.canCreateActivity;
  const openNewTask = useNewTaskUi((s) => s.openNewTask);

  // ── Queries ──
  const todayQuery = useQuery({ ...meTodayOptions(), enabled: TIME_TRACKING.fetchMyTodayAction });
  const tracking = TIME_TRACKING.fetchMyWeekHoursAction && todayQuery.data?.enabled === true;
  const hoursPerDay = todayQuery.data?.hoursPerDay ?? 8;
  const thisMonday = mondayOf(today);
  const lastMonday = addDays(thisMonday, -7);
  const thisWeek = useQuery({ ...meWeekHoursOptions(thisMonday), enabled: tracking });
  const lastWeek = useQuery({ ...meWeekHoursOptions(lastMonday), enabled: tracking });
  // The current week once it has hours, else the previous one; the delta compares with the week before the shown one.
  const showCurrent = hasHours(thisWeek.data);
  const beforeLast = useQuery({
    ...meWeekHoursOptions(addDays(thisMonday, -14)),
    enabled: tracking && thisWeek.isSuccess && !showCurrent,
  });
  const shownMonday = showCurrent ? thisMonday : lastMonday;
  const shownWeek = showCurrent ? thisWeek : lastWeek;
  const priorWeek = showCurrent ? lastWeek : beforeLast;

  const summaryQuery = useQuery({
    ...meNotificationsSummaryOptions(),
    enabled: NOTIFICATIONS_IMPLEMENTED.fetchNotificationsSummaryAction,
  });
  const notificationsQuery = useInfiniteQuery({
    ...meNotificationsOptions(),
    enabled: NOTIFICATIONS_IMPLEMENTED.fetchNotificationsAction,
  });
  const gmailOn = GMAIL_IMPLEMENTED.fetchGmailStatusAction && GMAIL_IMPLEMENTED.fetchGmailThreadsAction;
  const gmailStatus = useQuery({ ...meGmailStatusOptions(), enabled: gmailOn });
  const gmailConnected = gmailOn && gmailStatus.data?.connected === true;
  const gmailThreads = useInfiniteQuery({ ...meGmailThreadsOptions(), enabled: gmailConnected });
  const checklistsQuery = useInfiniteQuery({ ...meChecklistsOptions(), enabled: MY_SPACE.fetchChecklistsAction });
  const projectsQuery = useQuery({ ...catalogOptions.projectOptions(), enabled: canCreateTask || MY_SPACE.createChecklistAction });

  // ── Tasks (#1051): every count from `me.tasksSummary`, the rows 30 a page per open etapa group.
  const queryClient = useQueryClient();
  const statusesQuery = useQuery(catalogOptions.taskStatuses());
  const { canCreateActivity, statusScope, canChangeResponsible } = capabilities;
  // Apoyo (#1038): the people list loads once the viewer can change it.
  const staffQuery = useQuery({ ...catalogOptions.staff(), enabled: canChangeResponsible });
  const taskColumns = useMemo(
    () =>
      miEspacioTaskColumns({
        qc: queryClient,
        capabilities: { canCreateActivity, statusScope, canChangeResponsible },
        statuses: statusesQuery.data ?? [],
        staff: staffQuery.data ?? NO_STAFF,
      }),
    [queryClient, canCreateActivity, statusScope, canChangeResponsible, statusesQuery.data, staffQuery.data],
  );
  const [created, setCreated] = useState<ReadonlySet<string>>(() => new Set());
  // Delete (#1041): deleted tasks (and their subtasks) leave the table right away; the counts follow the refetch.
  const deletes = useDeleteTasks();
  const isHidden = deletes.isHidden;
  // "Ocultar completadas" (#1039): off lists my closed tasks too (muted, never late, last in each group);
  // on leaves them out and each project says how many. Hidden by default here; the switch shows them.
  const [hideCompleted, setHideCompleted] = useHideCompletedTasks({ defaultHidden: true });
  const retraso = filters.estado === "retraso";
  const withClosed = !hideCompleted && !retraso;
  // The search reaches the server once typing pauses.
  const searchText = useDebouncedValue(filters.q, SEARCH_DEBOUNCE_MS);
  const summaryInput = useMemo(
    () => myTasksSummaryInput({ etapa: filters.etapa, q: searchText, retraso }),
    [filters.etapa, searchText, retraso],
  );
  const tasksQuery = useQuery(meTasksSummaryOptions(summaryInput));
  const summary = tasksQuery.data ?? EMPTY_MY_TASKS_SUMMARY;
  const etapaOptions = summary.etapas;
  const etapa = filters.etapa;

  // ── Rows per open etapa group.
  const [groupRows, setGroupRows] = useState<Record<string, GroupRowsState>>({});
  const rowActions = useRef(new Map<string, GroupRowsActions>());
  const onGroupState = useCallback((id: string, state: GroupRowsState) => {
    setGroupRows((prev) => (sameState(prev[id], state) ? prev : { ...prev, [id]: state }));
  }, []);
  const rowsOf = useCallback(
    (id: string): TaskRow[] | undefined => {
      const state = groupRows[id];
      if (!state?.rows) return state?.error ? [] : undefined;
      return state.rows.filter((row) => !isHidden(row.id, row.parentTaskId)).map((row) => taskRow(listItemOfRow(row), today));
    },
    [groupRows, isHidden, today],
  );
  const groups = useMemo(() => myTasksSummaryGroups(summary, { withClosed, rowsOf }), [summary, withClosed, rowsOf]);
  const visibleRows = useMemo(() => groups.flatMap((g) => (g.children ?? []).flatMap((c) => c.rows ?? [])), [groups]);
  const loadedTasks = useMemo(
    () =>
      Object.values(groupRows).flatMap((state) =>
        (state.rows ?? []).filter((row) => !isHidden(row.id, row.parentTaskId)).map(listItemOfRow),
      ),
    [groupRows, isHidden],
  );
  const tasksById = useMemo(() => new Map(loadedTasks.map((task) => [task.id, task])), [loadedTasks]);
  // ── Row checkboxes and the bulk bar (#1040): a filter change clears the selection.
  const visibleIds = useMemo(() => visibleRows.map((row) => row.id), [visibleRows]);
  const selection = useTaskSelection({
    visibleIds,
    resetKey: JSON.stringify([filters.estado, etapa, searchText, hideCompleted]),
  });
  const taskOfId = useCallback((id: string) => tasksById.get(id), [tasksById]);
  const all = summary.all;
  const shown = summary.shown;
  const shownPct = shownMetrics(shown);

  // ── Checklists ──
  const checklists = useMemo(() => flattenPages(checklistsQuery.data?.pages), [checklistsQuery.data]);
  const visibleChecklists = useMemo(() => checklists.filter((c) => matches(c.title, q)), [checklists, q]);
  const checklistTotals = checklistMetrics(checklists);

  // ── Bandeja ──
  const notifications = useMemo(() => notificationsQuery.data?.pages.flatMap((p) => p.items) ?? [], [notificationsQuery.data]);
  const threads = useMemo(
    () => (gmailConnected ? (gmailThreads.data?.pages[0]?.threads ?? []) : null),
    [gmailConnected, gmailThreads.data],
  );
  const bandeja = useMemo(() => {
    if (q === "") return bandejaRows(summaryQuery.data ?? [], threads);
    return bandejaRows(
      summaryOfItems(notifications.filter((n) => matches(n.title, q))),
      threads ? threads.filter((t) => matches(t.subject, q)) : null,
    );
  }, [q, summaryQuery.data, notifications, threads]);
  const unreadTotal = summaryQuery.data
    ? bandejaRows(summaryQuery.data, threads).reduce((sum, row) => sum + row.unread, 0)
    : (notificationsQuery.data?.pages[0]?.unreadCount ?? 0);

  // ── Sections, groups and the URL ──
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(ALL_OPEN);
  const [closedEtapas, setClosedEtapas] = useState<ReadonlySet<string>>(() => new Set());
  const projectIds = groups.map((g) => g.id);
  const openProjects = filters.abiertos === null ? projectIds : projectIds.filter((id) => filters.abiertos!.includes(id));
  const expanded = [
    ...openProjects,
    ...groups.flatMap((g) => (g.children ?? []).map((c) => c.id)).filter((id) => !closedEtapas.has(id)),
  ];
  const everythingOpen =
    SECTIONS.every((key) => openSections[key]) && openProjects.length === projectIds.length && closedEtapas.size === 0;
  // The rows load only for the open etapa groups.
  const openGroups = useMemo(() => {
    const projects = new Set(openProjects);
    return summary.projects.flatMap((p) =>
      projects.has(p.project.id)
        ? p.etapas
            .filter((t) => groupRowCount(t, withClosed) > 0 && !closedEtapas.has(etapaGroupId(p.project.id, t.etapa.id)))
            .map((t) => ({
              id: etapaGroupId(p.project.id, t.etapa.id),
              filters: meTasksGroupFilters(summaryInput, p.project.id, t.etapa.key, withClosed),
            }))
        : [],
    );
  }, [openProjects, summary.projects, closedEtapas, withClosed, summaryInput]);

  function retryGroup(id: string) {
    const group = openGroups.find((g) => g.id === id);
    if (group) void queryClient.refetchQueries({ queryKey: meTasksListOptions(group.filters).queryKey, exact: true });
  }

  const setParam = (key: string, value: string | null) => replaceMiEspacioParam(key, value);

  function onExpandedChange(ids: string[]) {
    const next = new Set(ids);
    const projects = projectIds.filter((id) => next.has(id));
    setParam(ABIERTOS_PARAM, projects.length === projectIds.length ? null : abiertosParam(projects));
    const etapaIds = groups.flatMap((g) => (g.children ?? []).map((c) => c.id));
    setClosedEtapas(new Set(etapaIds.filter((id) => !next.has(id))));
  }

  function toggleEverything() {
    const open = !everythingOpen;
    setOpenSections(open ? ALL_OPEN : { tareas: false, horas: false, bandeja: false, checklists: false });
    setClosedEtapas(new Set());
    setParam(ABIERTOS_PARAM, open ? null : "");
  }

  function goTo(event: MouseEvent<HTMLAnchorElement>, key: SectionKey) {
    event.preventDefault();
    setOpenSections((s) => ({ ...s, [key]: true }));
    const heading = document.getElementById(`s-${key}-titulo`);
    document.getElementById(`s-${key}`)?.scrollIntoView?.({ block: "start" });
    heading?.focus();
  }

  function clearFilters() {
    setParam(ESTADO_PARAM, null);
    setParam(ETAPA_PARAM, null);
    setParam(SEARCH_PARAM, null);
  }

  // ── Mutations ──
  const createTask = useActionMutation<{ draft: QuickAddDraft; projectId: string; etapaId: string | null }, TaskDetail>(
    ({ draft, projectId, etapaId }) =>
      createUserTaskAction({
        projectId,
        title: draft.title,
        workflowId: draft.etapaId ?? etapaId,
        managerId: viewerId,
        priority: draft.priority,
        commitmentDate: draft.dueDate,
      }),
    {
      setData: (qc, detail) => {
        insertMeTaskRow(qc, listItemOfDetail(detail), today);
        setCreated((ids) => new Set(ids).add(detail.id));
      },
      invalidate: (vars) => newTaskInvalidations(vars.projectId),
    },
  );

  /** The etapa a quick add falls back to: the project's current etapa, else the only one among my tasks there. */
  function fallbackEtapa(group: Group<TaskRow>): string | null {
    const current = projectsQuery.data?.find((p) => p.id === group.id)?.currentWorkflowId ?? null;
    if (current) return current;
    const etapas = summary.projects.find((p) => p.project.id === group.id)?.etapas ?? [];
    const ids = new Set(etapas.map((t) => t.etapa.id).filter(Boolean));
    return ids.size === 1 ? ([...ids][0] as string) : null;
  }

  // A failed group says so in its last row, with a retry.
  const withErrors: Group<TaskRow>[] = groups.map((group) => ({
    ...group,
    children: (group.children ?? []).map((child) =>
      groupRows[child.id]?.error
        ? {
            ...child,
            loading: false,
            quickAdd: (
              <tr>
                <td colSpan={taskColumns.length + 2} className="border-b border-border px-3 py-2">
                  <ErrorState title={SECTION_ERROR} onRetry={() => retryGroup(child.id)} />
                </td>
              </tr>
            ),
          }
        : { ...child, loading: child.loading && openGroups.some((g) => g.id === child.id), hasMore: groupRows[child.id]?.hasMore ?? false },
    ),
  }));

  const tableGroups: Group<TaskRow>[] = withErrors.map((group) => {
    if (!canCreateTask || !group.children || group.children.length === 0) return group;
    const quickAdd = (
      <QuickAddRow
        variant="row"
        colSpan={taskColumns.length + 2}
        context={{
          label: `Agregar tarea en ${group.label}`,
          projectId: group.id,
          etapaId: fallbackEtapa(group),
          assigneeId: viewerId,
          placeholder: `Escribe para agregar una tarea en ${group.label}…  #etapa  fecha  !prioridad`,
        }}
        onCreate={async (draft): Promise<QuickAddCreated> => {
          const task = await createTask.mutateAsync({ draft, projectId: group.id, etapaId: fallbackEtapa(group) });
          return { id: task.id, title: task.title };
        }}
      />
    );
    const children = group.children.map((child, index, list) => (index === list.length - 1 ? { ...child, quickAdd } : child));
    return { ...group, children };
  });

  const shownGroups: Group<TaskRow>[] = tableGroups.map((group) => {
    const hidden = hideCompleted && !retraso ? (summary.projects.find((p) => p.project.id === group.id)?.closed ?? 0) : 0;
    if (hidden === 0 || !group.children || group.children.length === 0) return group;
    const line = (
      <HiddenCompletedLine count={hidden} colSpan={taskColumns.length + 2} onShow={() => setHideCompleted(false)} />
    );
    const children = group.children.map((child, index, list) =>
      index === list.length - 1
        ? {
            ...child,
            quickAdd: (
              <>
                {line}
                {child.quickAdd}
              </>
            ),
          }
        : child,
    );
    return { ...group, children };
  });

  // The footer counts every listed task (the summary), not only the loaded rows.
  const newCount = visibleRows.filter((row) => created.has(row.id)).length;
  const listed = groupRowCount(shown, withClosed);
  const lateSum = shown.daysLateSum;
  const totalsLabel = `Total · ${listed} ${listed === 1 ? "tarea" : "tareas"}${
    newCount > 0 ? ` (${listed - newCount} abiertas + ${newCount} ${newCount === 1 ? "nueva" : "nuevas"})` : ""
  }`;

  // The export lists every task the filters match, also the rows not loaded yet: read on demand, group by group.
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const lists = summary.projects.flatMap((p) =>
        p.etapas
          .filter((t) => groupRowCount(t, withClosed) > 0)
          .map((t) => meTasksGroupFilters(summaryInput, p.project.id, t.etapa.key, withClosed)),
      );
      const pages = await Promise.all(lists.map((f) => fetchAllMeTasksListRows(f)));
      const rows = pages.flatMap((list) =>
        list.filter((row) => !isHidden(row.id, row.parentTaskId)).map((row) => taskRow(listItemOfRow(row), today)),
      );
      downloadText(miEspacioCsv(rows), miEspacioCsvFileName(today));
    } finally {
      setExporting(false);
    }
  }

  // ── Sheets ──
  const [inboxOpen, setInboxOpen] = useState(false);
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const openChecklist = checklistId ? (checklists.find((c) => c.id === checklistId) ?? null) : null;

  function openInbox(tab: InboxTab) {
    setParam(INBOX_TAB_PARAM, tab === "todo" ? null : tab);
    setInboxOpen(true);
  }

  // ── KPIs ──
  const shownTotal = shownWeek.data?.total ?? 0;
  const delta = shownWeek.data && priorWeek.data ? shownTotal - priorWeek.data.total : null;
  const kpis: KpiStripItem[] = [
    { key: "abiertas", label: "Mis abiertas", value: all.open },
    { key: "vencidas", label: "Vencidas", value: all.overdue, tone: all.overdue > 0 ? "destructive" : "default" },
    ...(tracking
      ? [
          {
            key: "horas",
            label: "Horas semana",
            value: `${hoursText(shownTotal)} h`,
            ...(delta !== null
              ? { delta: { label: signedText(delta), tone: delta > 0 ? ("good" as const) : delta < 0 ? ("bad" as const) : ("neutral" as const) } }
              : {}),
          },
        ]
      : []),
    { key: "bandeja", label: "Bandeja sin leer", value: unreadTotal },
    {
      key: "checklists",
      label: "Checklists",
      value: checklistTotals.pct === null ? "—" : `${checklistTotals.pct} %`,
    },
  ];

  const filterGroups: FilterGroup[] = [
    {
      id: ESTADO_PARAM,
      label: "Estado",
      value: filters.estado,
      options: [
        { value: "abiertas", label: "Abiertas", count: all.open },
        { value: ESTADO_RETRASO, label: "En retraso", count: all.overdue, tone: "destructive" },
      ],
    },
    {
      id: ETAPA_PARAM,
      label: "Etapa",
      value: etapa ?? "todos",
      options: [
        { value: "todos", label: "Todos" },
        ...etapaOptions.map((t) => ({ value: t.key, label: t.name, count: t.open, color: etapaColorVar(t) })),
      ],
    },
  ];

  const tasksError = tasksQuery.isError && !tasksQuery.data;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Mi espacio"
        description={MI_ESPACIO_ANALITICO_DESCRIPTION}
        badge={
          <Badge variant="secondary">
            <Lock aria-hidden="true" />
            Solo tú lo ves
          </Badge>
        }
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void exportCsv()} disabled={listed === 0 || exporting}>
              <Download aria-hidden="true" />
              Exportar
            </Button>
            <Popover>
              <PopoverTrigger render={<Button type="button" />}>
                <Zap aria-hidden="true" />
                Captura rápida
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(420px,calc(100vw-32px))] p-3">
                <QuickCapture />
              </PopoverContent>
            </Popover>
          </>
        }
      />

      {notice}

      <FilterCard
        groups={filterGroups}
        onChange={(groupId, value) => {
          if (groupId === ESTADO_PARAM) setParam(ESTADO_PARAM, value === ESTADO_RETRASO ? ESTADO_RETRASO : null);
          if (groupId === ETAPA_PARAM) setParam(ETAPA_PARAM, value === "todos" ? null : value);
        }}
        search={{
          value: filters.q,
          onChange: (value) => setParam(SEARCH_PARAM, value === "" ? null : value),
          placeholder: "Buscar en mi espacio",
          label: "Buscar en mi espacio",
        }}
      />

      <KpiStrip items={kpis} loading={tasksQuery.isPending && !tasksError} />

      <nav aria-label="Ir a sección" className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
          Ir a
        </span>
        <AnchorLink href="#s-tareas" onClick={(e) => goTo(e, "tareas")} label="Mis tareas" count={all.overdue} tone="destructive" />
        <AnchorLink
          href="#s-horas"
          onClick={(e) => goTo(e, "horas")}
          label="Horas"
          count={tracking ? hoursText(shownTotal) : null}
        />
        <AnchorLink href="#s-bandeja" onClick={(e) => goTo(e, "bandeja")} label="Bandeja" count={unreadTotal} tone="secondary" />
        <AnchorLink href="#s-checklists" onClick={(e) => goTo(e, "checklists")} label="Checklists" count={checklists.length} />
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={toggleEverything}>
          {everythingOpen ? "Contraer todo" : "Expandir todo"}
        </Button>
      </nav>

      {/* Mis tareas */}
      <SectionCard
        id="tareas"
        title="Mis tareas"
        open={openSections.tareas}
        onToggle={() => setOpenSections((s) => ({ ...s, tareas: !s.tareas }))}
        meta={`${shown.open} ${shown.open === 1 ? "abierta" : "abiertas"} · ${shown.projects} ${shown.projects === 1 ? "proyecto" : "proyectos"}`}
        right={
          <>
            <span className="text-[12.5px]">
              Vencidas <b className={cn("font-mono font-semibold", shown.overdue > 0 && "text-destructive")}>{shown.overdue}</b>
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
              {shownPct.overduePct} % vencidas
            </span>
            <span className="text-[12.5px]">
              Retraso prom. <b className="font-mono font-semibold">{hoursText(shownPct.avgDaysLate)} d</b>
            </span>
          </>
        }
      >
        {tasksQuery.isPending && !tasksError ? (
          <div className="p-4">
            <LoadingSkeleton variant="table" rows={4} />
          </div>
        ) : tasksError ? (
          <ErrorState title={SECTION_ERROR} onRetry={() => void tasksQuery.refetch()} />
        ) : all.open === 0 && listed === 0 ? (
          <EmptyState
            title="No tienes tareas abiertas."
            action={
              canCreateTask
                ? { label: "Nueva tarea", onClick: () => openNewTask(viewerId ? { managerId: viewerId } : {}, "mi-espacio") }
                : undefined
            }
          />
        ) : shown.open === 0 && listed === 0 ? (
          <EmptyState title={NO_MATCH} action={{ label: CLEAR_FILTERS, onClick: clearFilters }} />
        ) : (
          <div className="flex flex-col gap-2 p-3">
            <HideCompletedSwitch className="self-end" checked={hideCompleted} onCheckedChange={setHideCompleted} />
            {openGroups.map((g) => (
              <GroupRowsLoader key={g.id} id={g.id} filters={g.filters} onState={onGroupState} actions={rowActions} />
            ))}
            <CellCommitProvider<TaskRow> queryKeys={MI_ESPACIO_COMMIT_KEYS}>
              <GroupedTable<TaskRow>
                label="Mis tareas"
                tableId="mi-espacio-tareas"
                columns={taskColumns}
                groups={shownGroups}
                isRowMuted={(row) => isTaskClosed(row)}
                expanded={expanded}
                onExpandedChange={onExpandedChange}
                onLoadMore={(id) => rowActions.current.get(id)?.more()}
                getRowId={(row) => row.id}
                rowHref={(row) => taskSheetHref("/mi-espacio", search, row.id)}
                isRowNew={(row) => created.has(row.id)}
                totals={{ label: totalsLabel, summary: `${lateSum} d` }}
                renderCell={(key, row) => renderTaskCell(key, row)}
                getRowLabel={(row) => tasksById.get(row.id)?.title ?? row.id}
                selectable
                selectedIds={selection.selectedIds}
                onSelectionChange={selection.onSelectionChange}
                rowActions={(row) => {
                  const task = tasksById.get(row.id);
                  return task
                    ? deletes.rowActions(deleteTargetOf(task), () =>
                        window.history.pushState(null, "", taskSheetHref("/mi-espacio", search, row.id)),
                      )
                    : [];
                }}
                onRowDelete={
                  deletes.canDelete
                    ? (row) => {
                        const task = tasksById.get(row.id);
                        if (task) deletes.request([deleteTargetOf(task)]);
                      }
                    : undefined
                }
              />
              {deletes.dialog}
            </CellCommitProvider>
            <TaskBulkBar
              selection={selection}
              taskOf={taskOfId}
              staff={staffQuery.data ?? NO_STAFF}
              deletes={deletes}
              invalidate={MI_ESPACIO_COMMIT_KEYS}
            />
          </div>
        )}
      </SectionCard>

      <div className="flex flex-wrap gap-5">
        {/* Horas de la semana */}
        <SectionCard
          id="horas"
          className="min-w-0 flex-[3_1_560px]"
          title="Horas de la semana"
          open={openSections.horas}
          onToggle={() => setOpenSections((s) => ({ ...s, horas: !s.horas }))}
          meta={tracking && shownWeek.data ? `${weekRangeText(shownMonday)} · meta ${hoursText(shownWeek.data.target)} h` : undefined}
          right={
            tracking && shownWeek.data ? (
              <span className="text-[12.5px]">
                Total <b className="font-mono font-semibold">{hoursText(shownTotal)} h</b>
              </span>
            ) : null
          }
        >
          {!tracking ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">El registro de horas está desactivado.</p>
          ) : shownWeek.isError ? (
            <ErrorState title={SECTION_ERROR} onRetry={() => void shownWeek.refetch()} />
          ) : !shownWeek.data ? (
            <div className="p-4">
              <LoadingSkeleton variant="table" rows={4} />
            </div>
          ) : (
            <HoursTable week={shownWeek.data} hoursPerDay={hoursPerDay} today={today} />
          )}
        </SectionCard>

        {/* Bandeja por tipo: hidden alone when its summary fails */}
        {NOTIFICATIONS_IMPLEMENTED.fetchNotificationsSummaryAction && !summaryQuery.isError ? (
          <SectionCard
            id="bandeja"
            className="min-w-0 flex-[2_1_360px]"
            title="Bandeja por tipo"
            open={openSections.bandeja}
            onToggle={() => setOpenSections((s) => ({ ...s, bandeja: !s.bandeja }))}
            right={
              summaryQuery.data ? (
                <span className="text-[12.5px]">
                  Sin leer{" "}
                  <b className={cn("font-mono font-semibold", unreadTotal > 0 && "text-secondary-foreground")}>{unreadTotal}</b> de{" "}
                  <span className="font-mono">{summaryQuery.data.reduce((sum, row) => sum + row.total, 0)}</span>
                </span>
              ) : null
            }
          >
            {summaryQuery.isPending ? (
              <div className="p-4">
                <LoadingSkeleton variant="table" rows={4} />
              </div>
            ) : bandeja.length === 0 ? (
              q !== "" ? (
                <EmptyState title={NO_MATCH} action={{ label: CLEAR_FILTERS, onClick: clearFilters }} />
              ) : (
                <EmptyState title="Tu bandeja está vacía." />
              )
            ) : (
              <BandejaTable rows={bandeja} now={now} onOpen={openInbox} />
            )}
          </SectionCard>
        ) : null}
      </div>

      {/* Checklists */}
      {MY_SPACE.fetchChecklistsAction ? (
        <SectionCard
          id="checklists"
          title="Checklists"
          open={openSections.checklists}
          onToggle={() => setOpenSections((s) => ({ ...s, checklists: !s.checklists }))}
          meta={`${checklists.length} ${checklists.length === 1 ? "activo" : "activos"}`}
          right={
            <span className="text-[12.5px]">
              Avance{" "}
              <b className="font-mono font-semibold">
                {checklistTotals.done}/{checklistTotals.total}
              </b>{" "}
              · <span className="font-mono">{checklistTotals.pct === null ? "—" : `${checklistTotals.pct} %`}</span>
            </span>
          }
        >
          {checklistsQuery.isPending ? (
            <div className="p-4">
              <LoadingSkeleton variant="table" rows={4} />
            </div>
          ) : checklistsQuery.isError ? (
            <ErrorState title={SECTION_ERROR} onRetry={() => void checklistsQuery.refetch()} />
          ) : (
            <ChecklistsTable
              checklists={visibleChecklists}
              filtered={q !== "" && checklists.length > 0}
              now={now}
              onOpen={setChecklistId}
              onClearFilters={clearFilters}
              projects={projectsQuery.data ?? []}
              hasMore={checklistsQuery.hasNextPage ?? false}
              loadingMore={checklistsQuery.isFetchingNextPage}
              onLoadMore={() => void checklistsQuery.fetchNextPage()}
            />
          )}
        </SectionCard>
      ) : null}

      {reader}

      <Sheet open={inboxOpen} onOpenChange={setInboxOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[720px]">
          <SheetHeader>
            <SheetTitle>Bandeja</SheetTitle>
            <SheetDescription>Tus notificaciones y tu correo.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{inboxOpen ? <Inbox /> : null}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={openChecklist !== null} onOpenChange={(open) => (open ? null : setChecklistId(null))}>
        <SheetContent className="w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{openChecklist?.title ?? "Checklist"}</SheetTitle>
            <SheetDescription>{openChecklist?.projectName ?? "Sin proyecto"}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{openChecklist ? <ChecklistCard checklist={openChecklist} /> : null}</div>
        </SheetContent>
      </Sheet>

      <TaskSheetRoute />
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** How long typing waits before the search reaches the server. */
const SEARCH_DEBOUNCE_MS = 300;

/** `value`, once it has stopped changing for `ms`. */
function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, settled, ms]);
  return settled;
}

/** What one etapa group's rows query reports to the page. */
type GroupRowsState = { rows: TaskListRow[] | undefined; loading: boolean; error: boolean; hasMore: boolean };
type GroupRowsActions = { more(): void };

function sameState(a: GroupRowsState | undefined, b: GroupRowsState): boolean {
  return !!a && a.rows === b.rows && a.loading === b.loading && a.error === b.error && a.hasMore === b.hasMore;
}

/**
 * One etapa group's rows (`useInfiniteQuery(me.tasksList(f))`, "retraso"
 * order, 30 a page; the first groups come seeded by the page). Renders
 * nothing: it reports the rows to the page, which hands them to
 * `GroupedTable`. Mounted only while its group is open.
 */
function GroupRowsLoader({
  id,
  filters,
  onState,
  actions,
}: {
  id: string;
  filters: MeTasksListFilters;
  onState(id: string, state: GroupRowsState): void;
  actions: RefObject<Map<string, GroupRowsActions>>;
}) {
  const list = useInfiniteQuery(meTasksListOptions(filters));
  const pages = list.data?.pages;
  const rows = useMemo(() => pages?.flatMap((p) => p.rows), [pages]);
  const loading = list.isPending || list.isFetchingNextPage;
  const error = list.isError && !rows;
  const hasMore = Boolean(list.hasNextPage);
  const { fetchNextPage } = list;

  // Registers "Cargar más" only; nothing loads here. A retry refetches the group's key from the page.
  useEffect(() => {
    const map = actions.current;
    map.set(id, { more: () => void fetchNextPage() });
    return () => {
      map.delete(id);
    };
  }, [id, fetchNextPage, actions]);

  useEffect(() => {
    onState(id, { rows, loading, error, hasMore });
  }, [id, rows, loading, error, hasMore, onState]);

  return null;
}

const NO_STAFF: { id: string; name: string }[] = [];

function renderTaskCell(key: string, row: TaskRow): ReactNode | undefined {
  if (key === TASK_SUPPORT_COLUMN) return <PeopleStack people={row.support} label={SUPPORT_COLUMN_LABEL} />;
  if (key === "title") {
    return (
      <span title={row.title} className="block max-w-full truncate">
        {row.title}
      </span>
    );
  }
  if (key === "estatus") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", statusDotClass(statusColorToken(row)))} />
        {row.estatus}
      </span>
    );
  }
  if (key === "vence") return <span className={cn("font-mono", row.overdue && "text-destructive")}>{row.vence}</span>;
  if (key === "retraso") {
    return (
      <span className={cn("rounded-sm px-1 font-mono", row.retraso >= DAYS_LATE_WARN && WARN)}>{row.retraso}</span>
    );
  }
  return undefined;
}

function AnchorLink({
  href,
  onClick,
  label,
  count,
  tone,
}: {
  href: string;
  onClick(event: MouseEvent<HTMLAnchorElement>): void;
  label: string;
  count: number | string | null;
  tone?: "destructive" | "secondary";
}) {
  const highlighted = typeof count === "number" ? count > 0 : count !== null;
  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-[30px] gap-2 rounded-md px-3 text-[12.5px] font-medium")}
    >
      {label}
      {count !== null ? (
        <span
          className={cn(
            "font-mono",
            highlighted && tone === "destructive"
              ? "text-destructive"
              : highlighted && tone === "secondary"
                ? "text-secondary-foreground"
                : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </a>
  );
}

function SectionCard({
  id,
  title,
  meta,
  right,
  open,
  onToggle,
  className,
  children,
}: {
  id: SectionKey;
  title: string;
  meta?: string;
  right?: ReactNode;
  open: boolean;
  onToggle(): void;
  className?: string;
  children: ReactNode;
}) {
  const bodyId = `s-${id}-cuerpo`;
  return (
    <section
      id={`s-${id}`}
      aria-labelledby={`s-${id}-titulo`}
      className={cn("scroll-mt-4 overflow-hidden rounded-lg border bg-card", className)}
    >
      <h2 className="m-0">
        <button
          id={`s-${id}-titulo`}
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <ChevronDown aria-hidden="true" className="chev size-4 shrink-0 text-muted-foreground" />
          <span className="text-[15px] font-semibold text-foreground">{title}</span>
          {meta ? <span className="font-mono text-[12.5px] font-normal text-muted-foreground">{meta}</span> : null}
          <span className="flex-1" />
          {right ? <span className="flex flex-wrap items-center gap-3 font-normal text-foreground">{right}</span> : null}
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="border-t">
        {open ? children : null}
      </div>
    </section>
  );
}

function HoursTable({ week, hoursPerDay, today }: { week: WeekHours; hoursPerDay: number; today: string }) {
  const days = week.days.slice(0, 5);
  const metaTotal = hoursPerDay * days.length;
  const total = days.reduce((sum, day) => sum + day.hours, 0);
  return (
    <Table className="min-w-[420px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col" className={cn(TH, STICKY_MUTED)}>
            Día
          </TableHead>
          <TableHead scope="col" className={cn(TH, "text-right")}>
            Horas
          </TableHead>
          <TableHead scope="col" className={cn(TH, "text-right")}>
            Meta
          </TableHead>
          <TableHead scope="col" className={cn(TH, "text-right")}>
            Diferencia
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {days.map((day) => {
          const short = day.date <= today && day.hours < hoursPerDay - 0.25;
          return (
            <TableRow key={day.date}>
              <TableHead scope="row" className={cn(TD, STICKY, "h-auto font-normal text-foreground")}>
                {dayLabel(day.date)}
              </TableHead>
              <TableCell className={cn(TD, "text-right font-mono", short && WARN)}>{hoursText(day.hours)}</TableCell>
              <TableCell className={cn(TD, "text-right font-mono")}>{hoursText(hoursPerDay)}</TableCell>
              <TableCell className={cn(TD, "text-right font-mono")}>{signedText(day.hours - hoursPerDay)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow className="hover:bg-transparent">
          <TableCell className={cn(TF, STICKY_MUTED)}>Total</TableCell>
          <TableCell className={cn(TF, "text-right font-mono")}>{hoursText(total)}</TableCell>
          <TableCell className={cn(TF, "text-right font-mono")}>{hoursText(metaTotal)}</TableCell>
          <TableCell className={cn(TF, "text-right font-mono")}>{signedText(total - metaTotal)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function BandejaTable({ rows, now, onOpen }: { rows: BandejaRow[]; now: Date; onOpen(tab: InboxTab): void }) {
  const unread = rows.reduce((sum, row) => sum + row.unread, 0);
  const total = rows.reduce((sum, row) => sum + (row.total ?? 0), 0);
  const latest = rows.reduce<string | null>(
    (max, row) => (row.latestAt && (!max || Date.parse(row.latestAt) > Date.parse(max)) ? row.latestAt : max),
    null,
  );
  return (
    <Table className="min-w-[340px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col" className={cn(TH, STICKY_MUTED)}>
            Tipo
          </TableHead>
          <TableHead scope="col" className={cn(TH, "text-right")}>
            Sin leer
          </TableHead>
          <TableHead scope="col" className={cn(TH, "text-right")}>
            Total
          </TableHead>
          <TableHead scope="col" className={TH}>
            Más reciente
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableHead scope="row" className={cn(TD, STICKY, "h-auto font-normal")}>
              <button
                type="button"
                onClick={() => onOpen(row.tab)}
                className="text-left text-foreground underline decoration-border underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {row.label}
              </button>
            </TableHead>
            <TableCell className={cn(TD, "text-right font-mono", row.unread > 0 && "font-semibold text-secondary-foreground")}>
              {row.unread}
            </TableCell>
            <TableCell className={cn(TD, "text-right font-mono")}>{row.total ?? "—"}</TableCell>
            <TableCell className={cn(TD, "font-mono")}>{latestLabel(row.latestAt, now)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow className="hover:bg-transparent">
          <TableCell className={cn(TF, STICKY_MUTED)}>Total</TableCell>
          <TableCell className={cn(TF, "text-right font-mono")}>{unread}</TableCell>
          <TableCell className={cn(TF, "text-right font-mono")}>{total}</TableCell>
          <TableCell className={cn(TF, "font-mono")}>{latestLabel(latest, now)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

const STALE_CHECKLIST_MS = 7 * 86_400_000;

function ChecklistsTable({
  checklists,
  filtered,
  now,
  onOpen,
  onClearFilters,
  projects,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  checklists: Checklist[];
  filtered: boolean;
  now: Date;
  onOpen(id: string): void;
  onClearFilters(): void;
  projects: { id: string; name: string }[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore(): void;
}) {
  const totals = checklistMetrics(checklists);
  const empty = checklists.length === 0;
  return (
    <>
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className={cn(TH, STICKY_MUTED)}>
              Checklist
            </TableHead>
            <TableHead scope="col" className={TH}>
              Proyecto
            </TableHead>
            <TableHead scope="col" className={TH}>
              Avance
            </TableHead>
            <TableHead scope="col" className={cn(TH, "text-right")}>
              Hechos
            </TableHead>
            <TableHead scope="col" className={TH}>
              Actualizado
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {empty ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="p-0">
                {filtered ? (
                  <EmptyState title={NO_MATCH} action={{ label: CLEAR_FILTERS, onClick: onClearFilters }} />
                ) : (
                  <EmptyState title="Aún no tienes checklists." />
                )}
              </TableCell>
            </TableRow>
          ) : null}
          {checklists.map((checklist) => {
            const pct = checklistPct(checklist);
            const done = checklist.items.filter((item) => item.done).length;
            const stale = now.getTime() - Date.parse(checklist.updatedAt) > STALE_CHECKLIST_MS;
            return (
              <TableRow key={checklist.id}>
                <TableHead scope="row" className={cn(TD, STICKY, "h-auto font-normal")}>
                  <button
                    type="button"
                    title={checklist.title}
                    onClick={() => onOpen(checklist.id)}
                    className="inline-block max-w-[320px] truncate text-left align-bottom text-foreground underline decoration-border underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {checklist.title}
                  </button>
                </TableHead>
                <TableCell className={cn(TD, !checklist.projectName && "text-muted-foreground")}>
                  {checklist.projectName ?? "—"}
                </TableCell>
                <TableCell className={TD}>
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className="relative h-1.5 w-[120px] overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn("absolute inset-y-0 left-0 rounded-full", pct !== null && pct < 30 ? "bg-chart-3" : "bg-primary")}
                        style={{ width: `${pct ?? 0}%` }}
                      />
                    </span>
                    <span className="font-mono">{pct === null ? "—" : `${pct} %`}</span>
                  </span>
                </TableCell>
                <TableCell className={cn(TD, "text-right font-mono")}>
                  {done}/{checklist.items.length}
                </TableCell>
                <TableCell className={cn(TD, "font-mono", stale && WARN)}>{timeAgo(checklist.updatedAt, now)}</TableCell>
              </TableRow>
            );
          })}
          {MY_SPACE.createChecklistAction ? <ChecklistQuickAdd projects={projects} /> : null}
        </TableBody>
        {empty ? null : (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className={cn(TF, STICKY_MUTED)}>Total</TableCell>
              <TableCell className={TF} />
              <TableCell className={cn(TF, "font-mono")}>{totals.avgPct === null ? "—" : `${totals.avgPct} %`}</TableCell>
              <TableCell className={cn(TF, "text-right font-mono")}>
                {totals.done}/{totals.total}
              </TableCell>
              <TableCell className={TF} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
      {hasMore ? (
        <div className="flex justify-center p-3">
          <Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? "Cargando…" : "Ver más"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** "Obra nueva #Casa" → title "Obra nueva" linked to the first project whose name starts with "Casa" (accents ignored). */
export function parseChecklistQuickAdd(
  text: string,
  projects: readonly { id: string; name: string }[],
): { title: string; projectId: string | null } {
  const match = /(?:^|\s)#(\S+)/.exec(text);
  if (!match) return { title: text.trim(), projectId: null };
  const token = fold(match[1]!.replace(/[-_]+/g, " "));
  const project =
    projects.find((p) => fold(p.name) === token) ??
    projects.find((p) => fold(p.name).startsWith(token)) ??
    projects.find((p) => fold(p.name).replace(/\s+/g, "").startsWith(token.replace(/\s+/g, "")));
  if (!project) return { title: text.trim(), projectId: null };
  const title = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`.replace(/\s+/g, " ").trim();
  return { title, projectId: project.id };
}

function ChecklistQuickAdd({ projects }: { projects: readonly { id: string; name: string }[] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useActionMutation<{ title: string; projectId?: string }, Checklist>(createChecklistAction, {
    setData: (qc, checklist) => {
      insertCachedChecklist(qc, checklist);
      setText("");
    },
    onFormError: setError,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (create.isPending) return;
    const { title, projectId } = parseChecklistQuickAdd(text, projects);
    if (!title) {
      setError(actionErrorText("INVALID"));
      return;
    }
    setError(null);
    create.mutate(projectId ? { title, projectId } : { title });
  }

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={5} className="py-1.5 pr-3 pl-10">
        <form onSubmit={submit} className="flex flex-col gap-1">
          <label htmlFor="mi-espacio-agregar-checklist" className="sr-only">
            Agregar checklist
          </label>
          <Input
            id="mi-espacio-agregar-checklist"
            value={text}
            disabled={create.isPending}
            placeholder="Escribe para agregar un checklist…  #proyecto"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "mi-espacio-agregar-checklist-error" : undefined}
            onChange={(event) => {
              setText(event.target.value);
              if (error) setError(null);
            }}
            className="h-8 border-dashed text-[12.5px]"
          />
          {error ? (
            <p id="mi-espacio-agregar-checklist-error" role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      </TableCell>
    </TableRow>
  );
}
