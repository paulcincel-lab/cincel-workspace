"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Inbox } from "@/components/mi-espacio/Inbox";
import { QuickCapture } from "@/components/mi-espacio/QuickCapture";
import { NEW_NOTE, NOTE_PARAM, THREAD_PARAM, replaceMiEspacioParam } from "@/components/mi-espacio/search-params";
import { useChecklistMutations } from "@/components/mi-espacio/use-checklist-mutations";
import { ChecklistItemRow } from "@/components/tareas/ChecklistItemRow";
import { newTaskInvalidations } from "@/components/tareas/NewTaskDialog";
import { TaskSheetRoute, taskSheetHref } from "@/components/tareas/TaskSheet";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { EsencialCard } from "@/components/widgets/EsencialCard";
import { EsencialItemRow, type EsencialStatus } from "@/components/widgets/EsencialItemRow";
import { PageHeader } from "@/components/widgets/PageHeader";
import { QuickAddRow, type QuickAddCreated, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { tramoBadgeModel } from "@/components/widgets/TramoBadge";
import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { IMPLEMENTED as NOTIFICATIONS_IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import { createUserTaskAction, deleteTaskAction, setTaskStatusAction } from "@/lib/actions/tasks-actions";
import { canChangeActivityStatus, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { actionErrorText } from "@/lib/errors";
import {
  formatInboxTime,
  gmailSenderName,
  inboxCounts,
  mergeUnread,
  type InboxRow,
} from "@/lib/my-space/inbox";
import {
  dueInfo,
  greeting,
  groupMyTasksByProject,
  noteDayLabel,
  remainderText,
  timeAgo,
  type MyTasksGroup,
} from "@/lib/my-space/my-tasks";
import { sortNotes } from "@/lib/my-space/note-ui";
import {
  REMINDER_TIME_ZONE,
  formatReminderTime,
  reminderDayOffset,
  remindersForTodayAndTomorrow,
} from "@/lib/my-space/reminder-time";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { catalogOptions } from "@/lib/query/options/catalog";
import {
  flattenPages,
  meChecklistsOptions,
  meGmailStatusOptions,
  meGmailThreadsOptions,
  meNotesOptions,
  meNotificationsOptions,
  meRemindersOptions,
  meTasksOptions,
} from "@/lib/query/options/mi-espacio";
import { taskStatusInvalidations } from "@/lib/query/options/tareas";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { localDate } from "@/lib/time-tracking/local-time";
import type { TaskDetail, TaskListItem } from "@/lib/types/core";
import type { Checklist } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

/**
 * Mi espacio, Esencial (frame `MiEspacio-Esencial`): the greeting header,
 * then Mis tareas (by project, one-tap complete and a quick add per project)
 * and Notas on the left; Bandeja (newest unread), the first checklist and
 * Recordatorios on the right. Every list reads its `me.*` query; every
 * section exists only while its read action is implemented (FE §9).
 */
export type MiEspacioEsencialProps = {
  /** The `?nota=` not-found notice of the page, under the header. */
  notice?: ReactNode;
  /** The `?correo=` Gmail reader, under the right column. */
  reader?: ReactNode;
};

export const MI_ESPACIO_ESENCIAL_LIMITS = { projects: 3, perProject: 4 } as const;
/** How long "Agregada · Deshacer" stays under a task created here. */
export const CREATED_UNDO_MS = 8_000;

const ALL_MY_TASKS_HREF = "/tareas?responsable=yo";
const SECTION_ERROR = "No pudimos cargar esta sección.";
const NOTIFICATIONS_ON: boolean = NOTIFICATIONS_IMPLEMENTED.fetchNotificationsAction;
const GMAIL_ON: boolean = GMAIL_IMPLEMENTED.fetchGmailStatusAction && GMAIL_IMPLEMENTED.fetchGmailThreadsAction;
const CAN_OPEN_THREAD: boolean = GMAIL_ON && GMAIL_IMPLEMENTED.fetchGmailThreadAction;

const PILL = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-medium";
const MUTED_PILL = cn(PILL, "bg-muted text-foreground");
const DESTRUCTIVE_PILL = cn(PILL, "bg-destructive/14 text-destructive dark:bg-destructive/22");
const SECONDARY_PILL = cn(PILL, "bg-secondary text-secondary-foreground");

export function MiEspacioEsencial({ notice, reader }: MiEspacioEsencialProps): ReactNode {
  const user = useSessionStore(selectAuthenticatedUser);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const inboxId = useId();
  const now = new Date();

  const showInbox = NOTIFICATIONS_ON || GMAIL_ON;
  const name = user?.member.name ?? "";

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Mi espacio"
        description={`${greeting(now, name)}. Tu día en un vistazo.`}
        badge={
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
            <Lock aria-hidden="true" className="size-3" />
            Solo tú lo ves
          </span>
        }
        actions={
          <>
            {IMPLEMENTED.fetchNotesAction && IMPLEMENTED.createNoteAction ? (
              <Button type="button" variant="outline" onClick={() => replaceMiEspacioParam(NOTE_PARAM, NEW_NOTE)}>
                Nueva nota
              </Button>
            ) : null}
            <Popover open={captureOpen} onOpenChange={setCaptureOpen} modal="trap-focus">
              <PopoverTrigger render={<Button type="button" />}>Captura rápida</PopoverTrigger>
              <PopoverContent align="end" className="anim-in w-[min(28rem,calc(100vw-2rem))] p-3" aria-label="Captura rápida">
                <div className="flex flex-col gap-2">
                  <QuickCapture />
                  <div className="flex justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setCaptureOpen(false)}>
                      Cerrar
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </>
        }
      />

      {notice}

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-5">
          <MyTasksCard announce={setAnnouncement} />
          {IMPLEMENTED.fetchNotesAction ? <NotesCard now={now} /> : null}
        </div>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          {showInbox ? (
            <BandejaCard now={now} expanded={inboxOpen} controlsId={inboxId} onToggle={() => setInboxOpen((v) => !v)} />
          ) : null}
          {IMPLEMENTED.fetchChecklistsAction ? <FirstChecklistCard onNew={() => setCaptureOpen(true)} /> : null}
          {IMPLEMENTED.fetchRemindersAction ? <RemindersCard now={now} /> : null}
          {showInbox && inboxOpen ? (
            <div id={inboxId}>
              <Inbox />
            </div>
          ) : null}
          {reader}
        </div>
      </div>

      <TaskSheetRoute />
    </div>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function SectionError({ onRetry }: { onRetry(): void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span>{SECTION_ERROR}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}

function SkeletonRows({ count, className }: { count: number; className: string }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}

function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[13px] text-muted-foreground hover:underline">
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}

// ── Mis tareas ──────────────────────────────────────────────────────────────

type Created = { id: string; projectId: string };

/** A task detail as the `me.tasks()` row it becomes. */
function listItemOfDetail(detail: TaskDetail): TaskListItem {
  const { createdBy: _c, checklistItems: _i, attachments: _a, links: _l, history: _h, ...item } = detail;
  void _c;
  void _i;
  void _a;
  void _l;
  void _h;
  return item;
}

function dueStatus(task: TaskListItem, today: string): EsencialStatus {
  const info = dueInfo(task, today, "esencial");
  const tone = task.status === "bloqueado" || info.tone === "overdue" ? "destructive" : info.tone === "today" ? "default" : "muted";
  return { kind: "text", label: info.label, tone };
}

function MyTasksCard({ announce }: { announce(text: string): void }) {
  const query = useQuery(meTasksOptions());
  const user = useSessionStore(selectAuthenticatedUser);
  const capabilities = useMemo(() => resolveActivitiesCapabilities(user), [user]);
  const viewerId = user?.member.id ?? "";
  const canCreate = capabilities.canCreateActivity;
  const canDelete = capabilities.canDeleteActivity;
  const openNewTask = useNewTaskUi((s) => s.openNewTask);
  const projectsQuery = useQuery({ ...catalogOptions.projectOptions(), enabled: canCreate });
  const pathname = usePathname() ?? "/mi-espacio";
  const search = useSearchParams()?.toString() ?? "";
  const listRef = useRef<HTMLDivElement>(null);
  const [created, setCreated] = useState<Created[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const today = localDate(new Date());
  const tasks = useMemo(() => query.data ?? [], [query.data]);
  const createdIds = useMemo(() => new Set(created.map((c) => c.id)), [created]);
  const { groups, remaining } = useMemo(
    () => groupMyTasksByProject(tasks.filter((t) => !createdIds.has(t.id)), today, MI_ESPACIO_ESENCIAL_LIMITS),
    [tasks, createdIds, today],
  );
  const overdueCount = tasks.filter((t) => dueInfo(t, today).tone === "overdue").length;

  const dropCreated = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setCreated((list) => list.filter((c) => c.id !== id));
  }, []);

  const focusAfter = (selector: string | null) => {
    requestAnimationFrame(() => {
      const root = listRef.current;
      if (!root) return;
      const target =
        (selector ? root.querySelector<HTMLElement>(selector) : null) ??
        root.querySelector<HTMLElement>("input[data-task-check]");
      target?.focus();
    });
  };

  const undo = useActionMutation<TaskListItem, TaskDetail>((task) => setTaskStatusAction(task.id, task.status), {
    invalidate: (task) => [qk.me.tasks(), ...taskStatusInvalidations(task.projectId)],
  });

  const complete = useActionMutation<TaskListItem, TaskDetail, { previous: TaskListItem[] | undefined }>(
    (task) => setTaskStatusAction(task.id, "completado"),
    {
      optimistic: {
        async onMutate(qc, task) {
          await qc.cancelQueries({ queryKey: qk.me.tasks(), exact: true });
          const previous = qc.getQueryData<TaskListItem[]>(qk.me.tasks());
          qc.setQueryData<TaskListItem[]>(qk.me.tasks(), (old) => old?.filter((t) => t.id !== task.id));
          return { previous };
        },
        rollback: (qc, snap) => qc.setQueryData(qk.me.tasks(), snap.previous),
      },
      invalidate: (task) => [qk.me.tasks(), ...taskStatusInvalidations(task.projectId)],
    },
  );

  const createTask = useActionMutation<{ draft: QuickAddDraft; group: MyTasksGroup }, TaskDetail>(
    ({ draft, group }) =>
      createUserTaskAction({
        projectId: group.projectId,
        title: draft.title,
        workflowId: draft.tramoId ?? currentTramoOf(group),
        managerId: draft.assigneeId ?? viewerId,
        priority: draft.priority,
        commitmentDate: draft.dueDate,
      }),
    {
      setData: (qc, detail) => {
        const item = listItemOfDetail(detail);
        qc.setQueryData<TaskListItem[]>(qk.me.tasks(), (old) => [...(old ?? []).filter((t) => t.id !== item.id), item]);
      },
      invalidate: (vars) => newTaskInvalidations(vars.group.projectId),
    },
  );

  const removeTask = useActionMutation<Created, void>((c) => deleteTaskAction(c.id), {
    setData: (qc, _result, c) => {
      qc.setQueryData<TaskListItem[]>(qk.me.tasks(), (old) => old?.filter((t) => t.id !== c.id));
    },
    invalidate: (c) => newTaskInvalidations(c.projectId),
  });

  function currentTramoOf(group: MyTasksGroup): string | null {
    const project = projectsQuery.data?.find((p) => p.id === group.projectId);
    return project?.currentWorkflowId ?? group.tasks.find((t) => t.workflowId)?.workflowId ?? null;
  }

  function onComplete(task: TaskListItem, rows: TaskListItem[], projectId: string) {
    const index = rows.findIndex((t) => t.id === task.id);
    const next = rows[index + 1];
    complete.mutate(task, {
      onSuccess: () => {
        announce("Tarea completada");
        toast.success("Tarea completada", {
          action: { label: "Deshacer", onClick: () => undo.mutate(task) },
        });
      },
    });
    if (createdIds.has(task.id)) dropCreated(task.id);
    focusAfter(next ? `input[data-task-check="${next.id}"]` : `[data-quick-add="${projectId}"] input`);
  }

  async function onCreate(group: MyTasksGroup, draft: QuickAddDraft): Promise<QuickAddCreated> {
    const detail = await createTask.mutateAsync({ draft, group });
    const entry: Created = { id: detail.id, projectId: group.projectId };
    setCreated((list) => [...list.filter((c) => c.id !== entry.id), entry]);
    timers.current.set(
      entry.id,
      setTimeout(() => dropCreated(entry.id), CREATED_UNDO_MS),
    );
    announce("Tarea agregada");
    return { id: detail.id, title: detail.title };
  }

  function onUndoCreate(entry: Created) {
    dropCreated(entry.id);
    removeTask.mutate(entry, { onSuccess: () => announce("Tarea eliminada") });
    focusAfter(`[data-quick-add="${entry.projectId}"] input`);
  }

  const headingMeta =
    tasks.length > 0 ? (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={MUTED_PILL}>
          <span className="font-mono">{tasks.length}</span>&nbsp;{tasks.length === 1 ? "abierta" : "abiertas"}
        </span>
        {overdueCount > 0 ? (
          <span className={DESTRUCTIVE_PILL}>
            <span className="font-mono">{overdueCount}</span>&nbsp;{overdueCount === 1 ? "vencida" : "vencidas"}
          </span>
        ) : null}
      </span>
    ) : null;

  let body: ReactNode;
  if (query.isPending) {
    body = <SkeletonRows count={6} className="h-11" />;
  } else if (query.isError && !query.data) {
    body = <SectionError onRetry={() => void query.refetch()} />;
  } else if (tasks.length === 0) {
    body = (
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>No tienes tareas abiertas.</span>
        {canCreate ? (
          <Button type="button" variant="outline" size="sm" onClick={() => openNewTask()}>
            Nueva tarea
          </Button>
        ) : null}
      </div>
    );
  } else {
    const remainder = remainderText(remaining);
    body = (
      <div ref={listRef} className="flex flex-col gap-3.5">
        {groups.map((group, index) => {
          const extra = created
            .filter((c) => c.projectId === group.projectId)
            .map((c) => tasks.find((t) => t.id === c.id))
            .filter((t): t is TaskListItem => t !== undefined);
          const rows = [...group.tasks, ...extra];
          return (
            <section key={group.projectId} aria-label={group.name} className="flex min-w-0 flex-col">
              <h3 className="truncate py-1 text-[12.5px] font-semibold text-foreground">{group.name}</h3>
              <ul className="flex flex-col">
                {rows.map((task) => {
                  const isNew = createdIds.has(task.id);
                  const allowed = canChangeActivityStatus({ capabilities, task, viewerId });
                  const href = taskSheetHref(pathname, search, task.id);
                  const tramo = task.workflow ? tramoBadgeModel(task.workflow) : null;
                  return (
                    <li key={task.id} className={cn("border-b border-muted text-sm", isNew && "row-new")}>
                      <EsencialItemRow
                        title={task.title}
                        onOpen={() => window.history.pushState(null, "", href)}
                        leading={
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 accent-primary"
                            data-task-check={task.id}
                            aria-label={`Completar ${task.title}`}
                            title={allowed ? undefined : "No puedes cambiar el estatus"}
                            disabled={!allowed}
                            checked={false}
                            onChange={() => onComplete(task, rows, group.projectId)}
                          />
                        }
                        meta={
                          tramo
                            ? [{ key: "tramo", label: tramo.label, dot: tramo.slot ? `var(--chart-${tramo.slot})` : undefined }]
                            : []
                        }
                        status={dueStatus(task, today)}
                        isNew={isNew}
                      />
                      {isNew ? (
                        <p className="pb-2 text-xs text-secondary-foreground">
                          Agregada
                          {canDelete ? (
                            <>
                              {" · "}
                              <button
                                type="button"
                                className="underline underline-offset-2"
                                onClick={() => onUndoCreate({ id: task.id, projectId: group.projectId })}
                              >
                                Deshacer
                              </button>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {canCreate ? (
                <div data-quick-add={group.projectId} className="pt-1.5">
                  <QuickAddRow
                    variant="row"
                    context={{
                      label: `Agregar tarea en ${group.name}`,
                      projectId: group.projectId,
                      tramoId: currentTramoOf(group),
                      assigneeId: viewerId || null,
                      placeholder: "Escribe para agregar…",
                    }}
                    onCreate={(draft) => onCreate(group, draft)}
                  />
                  {index === 0 ? (
                    <p className="pt-1 font-mono text-[11.5px] text-muted-foreground" aria-hidden="true">
                      @persona&nbsp;&nbsp;#tramo&nbsp;&nbsp;viernes
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
        {remainder ? <CardLink href={ALL_MY_TASKS_HREF}>{remainder}</CardLink> : null}
      </div>
    );
  }

  return (
    <EsencialCard
      title="Mis tareas"
      meta={headingMeta}
      action={<CardLink href={ALL_MY_TASKS_HREF}>Ver todas</CardLink>}
    >
      {body}
    </EsencialCard>
  );
}

// ── Notas ───────────────────────────────────────────────────────────────────

function NotesCard({ now }: { now: Date }) {
  const query = useInfiniteQuery(meNotesOptions());
  const notes = useMemo(() => sortNotes(flattenPages(query.data?.pages)), [query.data]); // data-patterns: server-order
  const newest = notes.slice(0, 3);
  const canCreate = IMPLEMENTED.createNoteAction;

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <div aria-hidden="true" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[110px] rounded-lg" />
        ))}
      </div>
    );
  } else if (query.isError && !query.data) {
    body = <SectionError onRetry={() => void query.refetch()} />;
  } else if (notes.length === 0) {
    body = (
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>Aún no tienes notas.</span>
        {canCreate ? (
          <Button type="button" variant="outline" size="sm" onClick={() => replaceMiEspacioParam(NOTE_PARAM, NEW_NOTE)}>
            Nueva nota
          </Button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {newest.map((note) => {
          const day = noteDayLabel(note.updatedAt, now);
          return (
            <li key={note.id} className="min-w-0">
              <Link
                href={`?${NOTE_PARAM}=${encodeURIComponent(note.id)}`}
                scroll={false}
                onNavigate={(event) => {
                  event.preventDefault();
                  replaceMiEspacioParam(NOTE_PARAM, note.id);
                }}
                className="flex min-h-[110px] flex-col gap-1.5 rounded-lg border border-border bg-card p-4 shadow-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="truncate text-sm font-semibold text-foreground">{note.title || "Sin título"}</span>
                <span className="line-clamp-2 text-[13px] text-muted-foreground">{note.body}</span>
                <span className="mt-auto font-mono text-[11.5px] text-muted-foreground">
                  {note.pinned ? `fijada · ${day}` : day}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <EsencialCard
      title="Notas"
      meta={notes.length > 0 ? <span className="font-mono text-[13px] text-muted-foreground">{notes.length}</span> : null}
    >
      {body}
    </EsencialCard>
  );
}

// ── Bandeja ─────────────────────────────────────────────────────────────────

function BandejaCard({
  now,
  expanded,
  controlsId,
  onToggle,
}: {
  now: Date;
  expanded: boolean;
  controlsId: string;
  onToggle(): void;
}) {
  const notificationsQuery = useInfiniteQuery({ ...meNotificationsOptions(), enabled: NOTIFICATIONS_ON });
  const statusQuery = useQuery({ ...meGmailStatusOptions(), enabled: GMAIL_ON });
  const status = statusQuery.data ?? null;
  const gmailConnected = GMAIL_ON && status !== null && status.connected && status.scopeOk;
  const threadsQuery = useInfiniteQuery({ ...meGmailThreadsOptions(), enabled: gmailConnected });

  const notifications = useMemo(
    () => (NOTIFICATIONS_ON ? (notificationsQuery.data?.pages ?? []).flatMap((p) => p.items) : []),
    [notificationsQuery.data],
  );
  const unreadCount = NOTIFICATIONS_ON ? (notificationsQuery.data?.pages[0]?.unreadCount ?? 0) : 0;
  const threads = useMemo(
    () => (gmailConnected ? (threadsQuery.data?.pages ?? []).flatMap((p) => p.threads) : []),
    [gmailConnected, threadsQuery.data],
  );
  const rows = useMemo(() => mergeUnread(notifications, threads, 3), [notifications, threads]);
  const total = inboxCounts({ notifications, unreadCount, threads }).todo;

  const toggle = (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controlsId}
      onClick={onToggle}
      className="self-start text-[13px] text-muted-foreground hover:underline"
    >
      {expanded ? "Ocultar bandeja" : "Ver bandeja"} <span aria-hidden="true">{expanded ? "↑" : "→"}</span>
    </button>
  );

  let body: ReactNode;
  if (NOTIFICATIONS_ON && notificationsQuery.isPending) {
    body = <SkeletonRows count={3} className="h-10" />;
  } else if (NOTIFICATIONS_ON && notificationsQuery.isError && !notificationsQuery.data) {
    body = <SectionError onRetry={() => void notificationsQuery.refetch()} />;
  } else if (rows.length === 0) {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Estás al día.</p>
        {toggle}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-2.5">
        <ul className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <BandejaRow key={row.key} row={row} now={now} />
          ))}
        </ul>
        {toggle}
      </div>
    );
  }

  return (
    <div id="bandeja">
      <EsencialCard
        title="Bandeja"
        meta={
          total > 0 ? (
            <span className={SECONDARY_PILL}>
              <span className="font-mono">{total}</span>&nbsp;sin leer
            </span>
          ) : null
        }
      >
        {body}
      </EsencialCard>
    </div>
  );
}

function BandejaRow({ row, now }: { row: InboxRow; now: Date }) {
  const title =
    row.source === "gmail" ? `Correo: ${row.thread.subject || "(sin asunto)"}` : row.item.title;
  const line =
    row.source === "gmail"
      ? `${gmailSenderName(row.thread.from)} · ${formatInboxTime(row.thread.receivedAt, now)}`
      : [row.item.body, timeAgo(row.item.createdAt, now)].filter(Boolean).join(" · ");

  let heading: ReactNode = <span className="truncate text-[13.5px] font-medium text-foreground">{title}</span>;
  if (row.source === "gmail" && CAN_OPEN_THREAD) {
    heading = (
      <button
        type="button"
        onClick={() => replaceMiEspacioParam(THREAD_PARAM, row.thread.id)}
        className="truncate text-left text-[13.5px] font-medium text-foreground hover:underline"
      >
        {title}
      </button>
    );
  } else if (row.source === "notification" && row.item.url) {
    heading = (
      <Link href={row.item.url} className="truncate text-[13.5px] font-medium text-foreground hover:underline">
        {title}
      </Link>
    );
  }

  return (
    <li className="flex min-w-0 items-start gap-2.5">
      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      <span className="sr-only">Sin leer</span>
      <div className="flex min-w-0 flex-1 flex-col">
        {heading}
        <span className="truncate text-[12.5px] text-muted-foreground">{line}</span>
      </div>
    </li>
  );
}

// ── Checklist ───────────────────────────────────────────────────────────────

function FirstChecklistCard({ onNew }: { onNew(): void }) {
  const query = useInfiniteQuery(meChecklistsOptions());
  const first = flattenPages(query.data?.pages)[0] ?? null;

  if (query.isPending) {
    return (
      <EsencialCard title="Checklist">
        <SkeletonRows count={4} className="h-6" />
      </EsencialCard>
    );
  }
  if (query.isError && !query.data) {
    return (
      <EsencialCard title="Checklist">
        <SectionError onRetry={() => void query.refetch()} />
      </EsencialCard>
    );
  }
  if (!first) {
    return (
      <EsencialCard title="Checklist">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Aún no tienes checklists.</span>
          <Button type="button" variant="outline" size="sm" onClick={onNew}>
            Nuevo checklist
          </Button>
        </div>
      </EsencialCard>
    );
  }
  return <ChecklistBody checklist={first} />;
}

function ChecklistBody({ checklist }: { checklist: Checklist }) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toggle, add } = useChecklistMutations(checklist.id, { onAdded: () => setDraft(""), onAddError: setError });
  const canToggle = IMPLEMENTED.toggleChecklistItemAction;
  const canAdd = IMPLEMENTED.addChecklistItemAction;

  const total = checklist.items.length;
  const done = checklist.items.filter((i) => i.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const projectName = checklist.projectName;

  const submit = () => {
    if (!canAdd || add.isPending) return;
    const text = draft.trim();
    if (!text) {
      setError(actionErrorText("INVALID"));
      return;
    }
    setError(null);
    add.mutate(text);
  };

  return (
    <EsencialCard
      title={checklist.title}
      meta={
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {projectName ? <span className="truncate text-[12.5px] text-muted-foreground">{projectName}</span> : null}
          <span className="ml-auto font-mono text-[12.5px] text-muted-foreground">{`${done}/${total}`}</span>
        </span>
      }
    >
      <div className="flex flex-col gap-2.5">
        <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        {checklist.items.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {checklist.items.map((item) => (
              <li key={item.id} className="flex min-h-8 items-center text-[13.5px]">
                <ChecklistItemRow
                  label={item.text}
                  checked={item.done}
                  disabled={!canToggle}
                  onToggle={() => {
                    if (canToggle) toggle.mutate({ itemId: item.id, done: !item.done });
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}
        {canAdd ? (
          <div className="flex flex-col gap-1">
            <Input
              id={inputId}
              value={draft}
              placeholder="Agregar elemento"
              aria-label="Agregar elemento"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="h-8 text-sm"
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            {error ? (
              <p id={errorId} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </EsencialCard>
  );
}

// ── Recordatorios ───────────────────────────────────────────────────────────

const TOMORROW_FMT = new Intl.DateTimeFormat("es-MX", { timeZone: REMINDER_TIME_ZONE, weekday: "short", day: "numeric" });

/** "mar 10" (weekday and day, lower case, no period). */
function tomorrowLabel(dueAt: string): string {
  const parts = TOMORROW_FMT.formatToParts(new Date(dueAt));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((p) => p.type === type)?.value ?? "").replace(/\./g, "").trim().toLowerCase();
  return `${part("weekday")} ${part("day")}`;
}

function RemindersCard({ now }: { now: Date }) {
  const query = useQuery(meRemindersOptions());
  const upcoming = remindersForTodayAndTomorrow(query.data ?? [], now);

  let body: ReactNode;
  if (query.isPending) {
    body = <SkeletonRows count={2} className="h-8" />;
  } else if (query.isError && !query.data) {
    body = <SectionError onRetry={() => void query.refetch()} />;
  } else if (upcoming.length === 0) {
    body = <p className="text-sm text-muted-foreground">Sin recordatorios para hoy y mañana</p>;
  } else {
    body = (
      <ul className="flex flex-col gap-2">
        {upcoming.map((reminder) => {
          const today = reminderDayOffset(reminder.dueAt, now) === 0;
          return (
            <li key={reminder.id} className="flex min-w-0 items-center gap-2.5">
              <time
                dateTime={reminder.dueAt}
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 font-mono text-xs",
                  today ? "bg-secondary text-secondary-foreground" : "bg-muted text-foreground",
                )}
              >
                {today ? formatReminderTime(reminder.dueAt) : tomorrowLabel(reminder.dueAt)}
              </time>
              <span className="min-w-0 flex-1 text-[13.5px] text-foreground">{reminder.text}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  return <EsencialCard title="Recordatorios">{body}</EsencialCard>;
}
