"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AtSign, Bell, CalendarClock, Info, Lock, Plus, UserPlus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { Inbox } from "@/components/mi-espacio/Inbox";
import { NEW_NOTE, NOTE_PARAM, replaceMiEspacioParam } from "@/components/mi-espacio/search-params";
import { useChecklistMutations } from "@/components/mi-espacio/use-checklist-mutations";
import { useClockMutation, workedSecondsAt, type ClockAction } from "@/components/shell/use-clock-mutation";
import { newTaskInvalidations } from "@/components/tareas/NewTaskDialog";
import { TASK_SHEET_PARAM, TaskSheetRoute } from "@/components/tareas/TaskSheet";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { PageHeader } from "@/components/widgets/PageHeader";
import { QuickAddRow, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { etapaBadgeModel } from "@/components/widgets/EtapaBadge";
import { IMPLEMENTED as MY_SPACE } from "@/lib/actions/my-space-actions.flags";
import { createChecklistAction } from "@/lib/actions/my-space-actions";
import { markNotificationsReadAction } from "@/lib/actions/notifications-actions";
import { IMPLEMENTED as NOTIFICATIONS } from "@/lib/actions/notifications-actions.flags";
import { createUserTaskAction } from "@/lib/actions/tasks-actions";
import { IMPLEMENTED as TIME_TRACKING } from "@/lib/actions/time-tracking-actions.flags";
import { actionErrorText } from "@/lib/errors";
import {
  MY_TASK_BUCKET_LABEL,
  MY_TASK_BUCKETS,
  bucketPresetDate,
  clockTime,
  daySentence,
  dueInfo,
  greeting,
  hoursMinutes,
  hoursMinutesText,
  nextReminderToday,
  noteDayLabel,
  timeAgo,
  type MyTaskBucket,
} from "@/lib/my-space/my-tasks";
import { NOTE_COLOR_TINT, sortNotes } from "@/lib/my-space/note-ui";
import { ME_BOARD_FIRST_PAGE, MY_TASKS_ALL, meTasksBucketFilters } from "@/lib/my-space/my-tasks-summary";
import { mutationErrorText, useActionMutation } from "@/lib/query/mutation";
import { meProfileOptions, meTodayOptions } from "@/lib/query/options/me";
import {
  flattenPages,
  insertCachedChecklist,
  markCachedNotificationsRead,
  meChecklistsOptions,
  meNotesOptions,
  meNotificationsOptions,
  insertMeTaskRow,
  meRemindersOptions,
  meTasksListOptions,
  meTasksSummaryOptions,
  meWeekHoursOptions,
} from "@/lib/query/options/mi-espacio";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { addDays, localDate, mondayOf } from "@/lib/time-tracking/local-time";
import { etapaColorSlot, etapaColorVar } from "@/lib/etapas/etapa-color";
import { listItemOfRow } from "@/lib/tareas/page-data";
import type { TaskDetail, TaskListItem, UserTaskInput } from "@/lib/types/core";
import { loadMoreText } from "@/components/widgets/table-rows";
import type { Checklist, Note, NotificationItem, NotificationKind, TodayStatus, WeekHours } from "@/lib/types/redesign";

/**
 * Mi espacio, Visual layout (#1001, frame `MiEspacio-Visual`): header, the
 * "Mi día" hero (jornada ring, greeting, day sentence, chips and clock
 * buttons), the Mis tareas board (Hoy · Esta semana · Después, with a quick
 * add per column), Checklist and Bandeja cards, then Notas and the hours of
 * last week. Every section reads its own `me.*` query (seeded by the page)
 * and keeps the `IMPLEMENTED` guard of its read action.
 */
export type MiEspacioBoardProps = {
  /** The `?nota=` not-found notice (shared by every style). */
  notice?: ReactNode;
  /** The `?correo=` Gmail reading pane (shared by every style). */
  reader?: ReactNode;
  /** `canCreateActivity`: the column quick add. */
  canCreateTask: boolean;
};

export const MI_ESPACIO_VISUAL_DESCRIPTION = "Tu día, tus tareas y tus pendientes, de un vistazo.";
export const SECTION_ERROR_TEXT = "No pudimos cargar esta sección.";
export const MY_TASKS_HREF = "/tareas?responsable=yo";
export const NOTES_HREF = "/mi-espacio/notas";
/** Cards a column shows before "Cargar más" (its first page). */
export const BOARD_COLUMN_LIMIT = ME_BOARD_FIRST_PAGE;
export const BANDEJA_LIMIT = 4;
export const NOTES_LIMIT = 3;
export const CHECKLIST_ITEMS_LIMIT = 6;

const TICK_MS = 60_000;
const STAGGER_MS = 40;
const BOARD_ID = "mis-tareas";
const BANDEJA_ID = "bandeja";

const TINT_14 = "bg-[color-mix(in_oklab,var(--tint)_14%,var(--card))] dark:bg-[color-mix(in_oklab,var(--tint)_22%,var(--card))]";

function stagger(index: number, max = 10): CSSProperties {
  return { "--anim-delay": `${Math.min(index, max) * STAGGER_MS}ms` } as CSSProperties;
}

function tint(token: string): CSSProperties {
  return { "--tint": `var(--${token})` } as CSSProperties;
}

/** Plain left click without modifiers (the others keep the browser's behavior). */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** "Nueva tarea": the shell's `NewTaskDialogHost` renders the dialog from this store, with me as responsable. */
function openNewTask(meId: string | null): void {
  useNewTaskUi.getState().openNewTask(meId ? { managerId: meId } : {}, "mi-espacio");
}

/** The current time, moved on every minute (the jornada and the relative times). */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const CLOCK_ANNOUNCE: Record<ClockAction, string> = {
  clockIn: "Jornada en curso",
  pause: "Jornada en pausa",
  resume: "Jornada en curso",
  clockOut: "Jornada cerrada",
};

export function MiEspacioBoard({ notice, reader, canCreateTask }: MiEspacioBoardProps) {
  const now = useMinuteClock();
  const today = localDate(now);
  const [announcement, setAnnouncement] = useState("");
  const [inboxOpen, setInboxOpen] = useState(false);
  const inboxId = useId();

  const profileQuery = useQuery(meProfileOptions());
  const me = profileQuery.data ?? null;

  // #1051: the counts from `me.tasksSummary`; each column pages its own rows.
  const tasksQuery = useQuery(meTasksSummaryOptions(MY_TASKS_ALL));
  const dueToday = tasksQuery.data?.all.dueToday ?? 0;
  const overdue = tasksQuery.data?.all.overdue ?? 0;

  const showNotifications = NOTIFICATIONS.fetchNotificationsAction;
  const notificationsQuery = useInfiniteQuery({ ...meNotificationsOptions(), enabled: showNotifications });
  const unreadCount = notificationsQuery.data?.pages[0]?.unreadCount ?? 0;

  const remindersQuery = useQuery({ ...meRemindersOptions(), enabled: MY_SPACE.fetchRemindersAction });
  const reminder = nextReminderToday(remindersQuery.data ?? [], now);

  const todayQuery = useQuery({ ...meTodayOptions(), enabled: TIME_TRACKING.fetchMyTodayAction });
  const tracking = TIME_TRACKING.fetchMyTodayAction && todayQuery.data?.enabled === true;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Mi espacio"
        description={MI_ESPACIO_VISUAL_DESCRIPTION}
        badge={
          <Badge variant="secondary">
            <Lock aria-hidden="true" />
            Solo tú lo ves
          </Badge>
        }
        actions={
          <>
            {MY_SPACE.createNoteAction ? (
              <Button type="button" variant="outline" onClick={() => replaceMiEspacioParam(NOTE_PARAM, NEW_NOTE)}>
                Nueva nota
              </Button>
            ) : null}
            {canCreateTask ? (
              <Button type="button" onClick={() => openNewTask(me?.id ?? null)}>
                <Plus aria-hidden="true" />
                Nueva tarea
              </Button>
            ) : null}
          </>
        }
      />

      {notice}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {tasksQuery.isPending ? (
        <Skeleton className="h-[180px] rounded-lg" />
      ) : (
        <DayHero
          now={now}
          name={me?.name ?? ""}
          today={tracking ? todayQuery.data! : null}
          syncedAt={todayQuery.dataUpdatedAt}
          dueToday={dueToday}
          overdue={overdue}
          unread={showNotifications ? unreadCount : null}
          reminder={reminder}
          onAnnounce={setAnnouncement}
        />
      )}

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <TasksBoard
            query={tasksQuery}
            counts={tasksQuery.data?.all.buckets ?? null}
            today={today}
            meId={me?.id ?? null}
            canCreate={canCreateTask}
            onAnnounce={setAnnouncement}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {MY_SPACE.fetchChecklistsAction ? <ChecklistPanel /> : null}
          {showNotifications ? (
            <BandejaPanel
              now={now}
              open={inboxOpen}
              controls={inboxId}
              onToggle={() => setInboxOpen((open) => !open)}
            />
          ) : null}
        </div>
      </div>

      <div id={inboxId} hidden={!inboxOpen} className="min-w-0">
        {inboxOpen ? <Inbox /> : null}
      </div>
      {reader}

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        {MY_SPACE.fetchNotesAction ? <NotesPanel now={now} /> : null}
        {tracking && TIME_TRACKING.fetchMyWeekHoursAction ? (
          <HoursPanel today={today} hoursPerDay={todayQuery.data!.hoursPerDay} />
        ) : null}
      </div>

      <TaskSheetRoute />
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

/** A failed section query: the copy and a retry, inside its own card only. */
function SectionError({ onRetry }: { onRetry(): void }) {
  return (
    <div className="flex flex-col items-start gap-2 py-2">
      <p className="text-sm text-muted-foreground">{SECTION_ERROR_TEXT}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}

/** A circular meter on `pathLength` 100 (the `ring` utility animates the offset). */
function Ring({
  size,
  radius,
  stroke,
  value,
  track,
  color,
  label,
  children,
}: {
  size: number;
  radius: number;
  stroke: number;
  /** 0–1. */
  value: number;
  track: string;
  color: string;
  label: string;
  children: ReactNode;
}) {
  const offset = 100 - Math.round(Math.min(1, Math.max(0, value)) * 100);
  const c = size / 2;
  return (
    <div role="img" aria-label={label} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true" className="-rotate-90">
        <circle cx={c} cy={c} r={radius} fill="none" stroke={`var(--${track})`} strokeWidth={stroke} />
        <circle
          cx={c}
          cy={c}
          r={radius}
          fill="none"
          stroke={`var(--${color})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          className="ring"
          style={{ strokeDasharray: 100, strokeDashoffset: offset, "--ring-offset": offset } as CSSProperties}
        />
      </svg>
      <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function statusLine(status: TodayStatus, workedSeconds: number): string {
  const entrada = status.startedAt ? clockTime(status.startedAt) : "";
  switch (status.state) {
    case "on":
      return `Jornada en curso · entrada ${entrada}`;
    case "pausa":
      return `Jornada en pausa · entrada ${entrada}`;
    case "done":
      return `Jornada cerrada · ${hoursMinutesText(workedSeconds)}`;
    default:
      return "Aún no registras tu entrada";
  }
}

const CLOCK_BUTTONS: Record<TodayStatus["state"], { action: ClockAction; label: string; primary: boolean }[]> = {
  on: [
    { action: "pause", label: "Pausar jornada", primary: true },
    { action: "clockOut", label: "Registrar salida", primary: false },
  ],
  pausa: [
    { action: "resume", label: "Reanudar jornada", primary: true },
    { action: "clockOut", label: "Registrar salida", primary: false },
  ],
  off: [{ action: "clockIn", label: "Registrar entrada", primary: true }],
  done: [],
};

function DayHero({
  now,
  name,
  today,
  syncedAt,
  dueToday,
  overdue,
  unread,
  reminder,
  onAnnounce,
}: {
  now: Date;
  name: string;
  /** Null when time tracking is off for me: no ring, status or buttons. */
  today: TodayStatus | null;
  syncedAt: number;
  dueToday: number;
  overdue: number;
  /** Null while notifications are not implemented. */
  unread: number | null;
  reminder: { text: string; dueAt: string } | null;
  onAnnounce(text: string): void;
}) {
  const clock = useClockMutation({ source: "sidebar" });
  const [clockError, setClockError] = useState<string | null>(null);

  const worked = today ? workedSecondsAt({ status: today, syncedAt: syncedAt || now.getTime() }, now.getTime()) : 0;
  const { h, mm } = hoursMinutes(worked);

  function run(action: ClockAction) {
    setClockError(null);
    clock.mutate(action, {
      onSuccess: () => onAnnounce(CLOCK_ANNOUNCE[action]),
      onError: (err) => setClockError(mutationErrorText(err)),
    });
  }

  return (
    <section
      aria-label="Mi día"
      className="anim-in flex min-w-0 flex-col flex-wrap gap-8 rounded-lg border bg-card px-7 py-6 md:flex-row md:items-center"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-6">
        {today ? (
          <Ring
            size={132}
            radius={52}
            stroke={12}
            value={today.hoursPerDay > 0 ? worked / (today.hoursPerDay * 3600) : 0}
            track="border"
            color="primary"
            label={`Jornada: ${h} h ${mm} min de ${today.hoursPerDay} h`}
          >
            <span className="font-mono text-[22px] font-medium">
              {h}:{mm}
            </span>
            <span className="text-[11.5px] text-muted-foreground">de {today.hoursPerDay} h</span>
          </Ring>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {today ? (
            <p className="flex items-center gap-2 text-[13px] font-medium text-secondary-foreground">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-primary" />
              {statusLine(today, worked)}
            </p>
          ) : null}
          <h2 className="text-2xl font-semibold">{greeting(now, name)}</h2>
          <p className="text-sm text-foreground">{daySentence({ now, todayCount: dueToday, reminder })}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <HeroChip href={`#${BOARD_ID}`} value={dueToday} label="para hoy" className="bg-secondary text-secondary-foreground" />
        <HeroChip
          href={`#${BOARD_ID}`}
          value={overdue}
          label={overdue === 1 ? "vencida" : "vencidas"}
          className={`${TINT_14} text-destructive`}
          style={tint("destructive")}
        />
        {unread !== null ? (
          <HeroChip
            href={`#${BANDEJA_ID}`}
            value={unread}
            label="sin leer"
            className={`${TINT_14} text-(--chart-2-ink)`}
            style={tint("chart-2")}
          />
        ) : null}
      </div>

      {today && CLOCK_BUTTONS[today.state].length > 0 ? (
        <div className="flex flex-row flex-wrap gap-2 md:flex-col">
          {CLOCK_BUTTONS[today.state].map((b) => (
            <Button
              key={b.action}
              type="button"
              variant={b.primary ? "default" : "outline"}
              className="h-9"
              disabled={clock.isPending}
              onClick={() => run(b.action)}
            >
              {b.label}
            </Button>
          ))}
          {clockError ? (
            <p role="alert" className="text-xs text-destructive">
              {clockError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function HeroChip({
  href,
  value,
  label,
  className,
  style,
}: {
  href: string;
  value: number;
  label: string;
  className: string;
  style?: CSSProperties;
}) {
  return (
    <a
      href={href}
      aria-label={`${value} ${label}`}
      style={style}
      className={`lift flex w-28 flex-col gap-1 rounded-lg px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      <span className="font-mono text-[28px] leading-none font-semibold">{value}</span>
      <span className="text-[12.5px]">{label}</span>
    </a>
  );
}

// ── Mis tareas ───────────────────────────────────────────────────────────────

const QUICK_ADD_LABEL: Record<MyTaskBucket, string> = {
  hoy: "Agregar tarea para hoy",
  semana: "Agregar tarea para esta semana",
  despues: "Agregar tarea para después",
};

type CreateVars = { input: UserTaskInput; bucket: MyTaskBucket };

function TasksBoard({
  query,
  counts,
  today,
  meId,
  canCreate,
  onAnnounce,
}: {
  query: { isPending: boolean; isError: boolean; refetch(): unknown };
  /** Tasks per column (the summary); null while it loads. */
  counts: Record<MyTaskBucket, number> | null;
  today: string;
  meId: string | null;
  canCreate: boolean;
  onAnnounce(text: string): void;
}) {
  const headingId = useId();
  const [created, setCreated] = useState<ReadonlySet<string>>(() => new Set());

  const create = useActionMutation<CreateVars, TaskDetail>(({ input }) => createUserTaskAction(input), {
    setData: (qc, task) => {
      insertMeTaskRow(qc, task, today);
    },
    invalidate: (vars) => newTaskInvalidations(vars.input.projectId),
  });

  async function onCreate(bucket: MyTaskBucket, draft: QuickAddDraft) {
    if (!draft.projectId || !draft.etapaId) {
      onAnnounce("Indica el proyecto y la etapa de la tarea.");
      throw new Error("INVALID: proyecto");
    }
    const task = await create.mutateAsync({
      bucket,
      input: {
        projectId: draft.projectId,
        workflowId: draft.etapaId,
        title: draft.title,
        managerId: draft.assigneeId ?? meId,
        priority: draft.priority,
        commitmentDate: draft.dueDate ?? bucketPresetDate(bucket, today),
      },
    });
    setCreated((prev) => new Set(prev).add(task.id));
    onAnnounce(`Tarea agregada a ${MY_TASK_BUCKET_LABEL[bucket]}`);
    return { id: task.id, title: task.title };
  }

  return (
    <section id={BOARD_ID} aria-labelledby={headingId} className="anim-in flex min-w-0 flex-col gap-4" style={stagger(1)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-[17px] font-semibold">
          Mis tareas
        </h2>
        <Link href={MY_TASKS_HREF} className="text-[13px] text-muted-foreground hover:text-foreground">
          Ver todas →
        </Link>
      </div>
      {query.isError && !counts ? (
        <Card className="px-5 py-4">
          <SectionError onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3.5 md:grid-cols-3">
          {MY_TASK_BUCKETS.map((bucket, columnIndex) => (
            <BoardColumn
              key={bucket}
              bucket={bucket}
              count={counts?.[bucket] ?? null}
              today={today}
              created={created}
              columnIndex={columnIndex}
              quickAdd={
                canCreate ? (
                  <QuickAddRow
                    variant="card"
                    context={{
                      label: QUICK_ADD_LABEL[bucket],
                      projectId: null,
                      assigneeId: meId,
                      placeholder: "Escribe para agregar…",
                    }}
                    onCreate={(draft) => onCreate(bucket, draft)}
                  />
                ) : null
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BoardColumn({
  bucket,
  count,
  today,
  created,
  columnIndex,
  quickAdd,
}: {
  bucket: MyTaskBucket;
  /** Every task of the column (the summary); null while it loads. */
  count: number | null;
  today: string;
  created: ReadonlySet<string>;
  columnIndex: number;
  quickAdd: ReactNode;
}) {
  const label = MY_TASK_BUCKET_LABEL[bucket];
  // #1051: the first cards, then 30 more per "Cargar más", in due-date order from the server.
  const list = useInfiniteQuery(meTasksListOptions(meTasksBucketFilters(bucket)));
  const pages = list.data?.pages;
  const tasks = useMemo(() => (pages ?? []).flatMap((page) => page.rows.map(listItemOfRow)), [pages]);
  const loading = list.isPending;
  const total = count ?? pages?.at(-1)?.total ?? 0;
  const remaining = Math.max(0, total - tasks.length);
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-lg bg-input p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold">{label}</h3>
        <span className="rounded-full bg-card px-2 py-0.5 font-mono text-xs">{count === null ? "…" : count}</span>
      </div>
      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[110px] rounded-md bg-card" />
          ))}
        </div>
      ) : list.isError && !pages ? (
        <SectionError onRetry={() => void list.refetch()} />
      ) : (
        <ul role="list" aria-label={label} className="flex min-w-0 flex-col gap-2.5">
          {tasks.length === 0 ? (
            <li className="py-4 text-center text-sm text-muted-foreground">Nada aquí</li>
          ) : (
            tasks.map((task, i) => (
              <TaskCard
                key={task.id}
                task={task}
                today={today}
                fresh={created.has(task.id)}
                style={stagger(columnIndex + i)}
              />
            ))
          )}
        </ul>
      )}
      {list.hasNextPage ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-start px-0 text-[13px] text-muted-foreground hover:text-foreground"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {loadMoreText(remaining)}
        </Button>
      ) : null}
      {quickAdd ? (
        <div className="rounded-md border border-dashed border-input bg-card px-3 py-2 text-[13px]">{quickAdd}</div>
      ) : null}
    </div>
  );
}

/** Opens the task sheet over Mi espacio, keeping the other params; shallow, so there is no server render. */
function openTaskSheet(event: MouseEvent<HTMLAnchorElement>, taskId: string) {
  if (!isPlainClick(event)) return;
  event.preventDefault();
  const params = new URLSearchParams(window.location.search);
  params.set(TASK_SHEET_PARAM, taskId);
  window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
}

function taskHref(taskId: string): string {
  return `/mi-espacio?${new URLSearchParams({ [TASK_SHEET_PARAM]: taskId }).toString()}`;
}

function TaskCard({ task, today, fresh, style }: { task: TaskListItem; today: string; fresh: boolean; style: CSSProperties }) {
  const due = dueInfo(task, today);
  const etapa = task.workflow ? etapaBadgeModel(task.workflow) : null;
  const slot = task.workflow ? etapaColorSlot(task.workflow) : null;
  const color = etapaColorVar(task.workflow);
  const ink = slot ? `var(--chart-${slot}-ink)` : "var(--muted-foreground)";
  const subtasks = task.subtaskCount;
  const done = task.subtaskDoneCount;
  const href = taskHref(task.id);

  return (
    <li
      role="listitem"
      className={`anim-in lift flex min-w-0 flex-col gap-2 rounded-md border border-t-[3px] bg-card px-3.5 py-3 ${fresh ? "row-new" : ""}`}
      style={{ ...style, borderTopColor: color }}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        {etapa ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${TINT_14}`}
            style={{ "--tint": color, color: ink } as CSSProperties}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
            {etapa.label}
          </span>
        ) : (
          <span className="text-[11.5px] text-muted-foreground">Sin etapa</span>
        )}
        <DuePill tone={due.tone} label={due.label} />
      </div>
      <a
        href={href}
        onClick={(event) => openTaskSheet(event, task.id)}
        className="line-clamp-2 text-sm leading-[1.35] font-semibold hover:underline"
      >
        {task.title}
      </a>
      <p className="truncate text-[12.5px] text-muted-foreground">
        {fresh ? `${task.project.name} · recién creada` : task.project.name}
      </p>
      {subtasks > 0 ? (
        <div className="flex items-center gap-2">
          <div
            role="img"
            aria-label={`Subtareas ${done} de ${subtasks}`}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-accent"
          >
            <div
              className="grow-x h-full rounded-full"
              style={{ width: `${Math.round((done / subtasks) * 100)}%`, backgroundColor: color }}
            />
          </div>
          <span aria-hidden="true" className="font-mono text-[11.5px] text-muted-foreground">
            {done}/{subtasks}
          </span>
        </div>
      ) : null}
    </li>
  );
}

function DuePill({ tone, label }: { tone: ReturnType<typeof dueInfo>["tone"]; label: string }) {
  if (tone === "overdue") {
    return (
      <span
        className={`rounded-full px-2 py-0.5 font-mono text-[11.5px] text-destructive ${TINT_14}`}
        style={tint("destructive")}
      >
        {label}
      </span>
    );
  }
  if (tone === "today") {
    return (
      <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11.5px] text-secondary-foreground">
        {label}
      </span>
    );
  }
  return <span className="font-mono text-[11.5px] text-muted-foreground">{label}</span>;
}

// ── Checklist ────────────────────────────────────────────────────────────────

function ChecklistPanel() {
  const headingId = useId();
  const query = useInfiniteQuery(meChecklistsOptions());
  const checklists = useMemo(() => flattenPages(query.data?.pages), [query.data]);
  const first = checklists[0] ?? null;

  return (
    <Card className="anim-in flex flex-col gap-3.5 px-5 py-[18px]" style={stagger(2)}>
      <section aria-labelledby={headingId} className="flex flex-col gap-3.5">
        {query.isPending ? (
          <>
            <h2 id={headingId} className="sr-only">
              Checklist
            </h2>
            <Skeleton className="h-[180px]" />
          </>
        ) : query.isError ? (
          <>
            <h2 id={headingId} className="text-base font-semibold">
              Checklist
            </h2>
            <SectionError onRetry={() => void query.refetch()} />
          </>
        ) : first ? (
          <ChecklistBody checklist={first} headingId={headingId} />
        ) : (
          <EmptyChecklist headingId={headingId} />
        )}
      </section>
    </Card>
  );
}

function ChecklistBody({ checklist, headingId }: { checklist: Checklist; headingId: string }) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toggle, add } = useChecklistMutations(checklist.id, { onAdded: () => setDraft(""), onAddError: setError });

  const total = checklist.items.length;
  const doneCount = checklist.items.filter((i) => i.done).length;
  const pending = total - doneCount;
  const items = [...checklist.items.filter((i) => !i.done), ...checklist.items.filter((i) => i.done)].slice(
    0,
    CHECKLIST_ITEMS_LIMIT,
  );

  function submit() {
    if (!MY_SPACE.addChecklistItemAction || add.isPending) return;
    const text = draft.trim();
    if (!text) {
      setError(actionErrorText("INVALID"));
      return;
    }
    setError(null);
    add.mutate(text);
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <Ring
          size={56}
          radius={22}
          stroke={7}
          value={total === 0 ? 0 : doneCount / total}
          track="accent"
          color="chart-5"
          label={`${doneCount} de ${total} hechos`}
        >
          <span className="font-mono text-xs">
            {doneCount}/{total}
          </span>
        </Ring>
        <div className="min-w-0">
          <h2 id={headingId} className="truncate text-base font-semibold">
            {checklist.title}
          </h2>
          <p className="text-[12.5px] text-muted-foreground">{pending === 0 ? "Completo" : pending === 1 ? "1 pendiente" : `${pending} pendientes`}</p>
        </div>
      </div>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2.5 px-1.5 py-[7px]">
            <Checkbox
              id={`${inputId}-${item.id}`}
              checked={item.done}
              aria-label={item.text}
              disabled={!MY_SPACE.toggleChecklistItemAction}
              onCheckedChange={() => toggle.mutate({ itemId: item.id, done: !item.done })}
            />
            <label
              htmlFor={`${inputId}-${item.id}`}
              className={`min-w-0 flex-1 text-[13.5px] ${item.done ? "text-muted-foreground line-through" : ""}`}
            >
              {item.text}
            </label>
          </li>
        ))}
      </ul>
      {MY_SPACE.addChecklistItemAction ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="sr-only">
            Agregar al checklist
          </label>
          <Input
            id={inputId}
            value={draft}
            placeholder="Agregar al checklist"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
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
            <p id={`${inputId}-error`} className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function EmptyChecklist({ headingId }: { headingId: string }) {
  const inputId = useId();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useActionMutation<{ title: string }, Checklist>(createChecklistAction, {
    setData: (qc, checklist) => insertCachedChecklist(qc, checklist),
    onFormError: setError,
  });

  function submit() {
    const text = title.trim();
    if (!text) {
      setError(actionErrorText("INVALID"));
      return;
    }
    setError(null);
    create.mutate({ title: text });
  }

  return (
    <>
      <h2 id={headingId} className="text-base font-semibold">
        Checklist
      </h2>
      <p className="text-sm text-muted-foreground">Aún no tienes checklists.</p>
      {MY_SPACE.createChecklistAction ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="sr-only">
            Nombre del checklist
          </label>
          <Input
            id={inputId}
            value={title}
            placeholder="Nombre del checklist"
            aria-invalid={error ? true : undefined}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <Button type="button" variant="outline" size="sm" disabled={create.isPending} onClick={submit}>
            Nuevo checklist
          </Button>
        </div>
      ) : null}
    </>
  );
}

// ── Bandeja ──────────────────────────────────────────────────────────────────

type KindTile = { icon: LucideIcon; className: string; tint?: string };

const KIND_TILE: Partial<Record<NotificationKind, KindTile>> = {
  mencion: { icon: AtSign, className: "bg-secondary text-secondary-foreground" },
  asignacion: { icon: UserPlus, className: `${TINT_14} text-(--chart-2-ink)`, tint: "chart-2" },
  recordatorio: { icon: Bell, className: `${TINT_14} text-(--chart-3-ink)`, tint: "chart-3" },
  vencimiento: { icon: CalendarClock, className: `${TINT_14} text-(--chart-3-ink)`, tint: "chart-3" },
};
const OTHER_TILE: KindTile = { icon: Info, className: "bg-muted text-muted-foreground" };

function BandejaPanel({
  now,
  open,
  controls,
  onToggle,
}: {
  now: Date;
  open: boolean;
  controls: string;
  onToggle(): void;
}) {
  const headingId = useId();
  const query = useInfiniteQuery(meNotificationsOptions());
  const items = useMemo(() => flattenPages(query.data?.pages).slice(0, BANDEJA_LIMIT), [query.data]);
  const unread = query.data?.pages[0]?.unreadCount ?? 0;

  const markRead = useActionMutation<string[], { unreadCount: number }>(markNotificationsReadAction, {
    setData: (qc, { unreadCount }, ids) => markCachedNotificationsRead(qc, ids, unreadCount),
  });

  function onOpenItem(item: NotificationItem) {
    if (item.readAt === null && NOTIFICATIONS.markNotificationsReadAction) markRead.mutate([item.id]);
  }

  return (
    <Card id={BANDEJA_ID} className="anim-in flex flex-col gap-3 px-5 py-[18px]" style={stagger(3)}>
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 id={headingId} className="text-base font-semibold">
              Bandeja
            </h2>
            {unread > 0 ? (
              <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[11.5px] text-primary-foreground">
                {unread}
                <span className="sr-only"> sin leer</span>
              </span>
            ) : null}
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={controls}
            onClick={onToggle}
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            {open ? "Cerrar ↑" : "Abrir →"}
          </button>
        </div>
        {query.isPending ? (
          <Skeleton className="h-[180px]" />
        ) : query.isError ? (
          <SectionError onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada nuevo por aquí.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li key={item.id}>
                <BandejaRow item={item} now={now} onOpen={() => onOpenItem(item)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}

function BandejaRow({ item, now, onOpen }: { item: NotificationItem; now: Date; onOpen(): void }) {
  const unread = item.readAt === null;
  const tile = KIND_TILE[item.kind] ?? OTHER_TILE;
  const Icon = tile.icon;
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`flex size-[34px] shrink-0 items-center justify-center rounded-md ${tile.className}`}
        style={tile.tint ? tint(tile.tint) : undefined}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-[13.5px] ${unread ? "font-semibold" : "font-medium text-muted-foreground"}`}>
          {item.title}
        </span>
        <span className="truncate text-[12.5px] text-muted-foreground">
          {item.body ? `${item.body} · ` : ""}
          {timeAgo(item.createdAt, now)}
        </span>
      </span>
      {unread ? (
        <span className="flex shrink-0 items-center">
          <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
          <span className="sr-only">Sin leer</span>
        </span>
      ) : null}
    </>
  );
  const className = `lift flex min-w-0 items-center gap-3 rounded-md border px-3 py-2.5 text-left ${
    unread ? "border-secondary bg-muted" : "border-transparent"
  }`;
  if (item.url) {
    return (
      <Link href={item.url} onClick={onOpen} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onOpen} className={`w-full ${className}`}>
      {body}
    </button>
  );
}

// ── Notas ────────────────────────────────────────────────────────────────────

function NotesPanel({ now }: { now: Date }) {
  const headingId = useId();
  const query = useInfiniteQuery(meNotesOptions());
  const notes = useMemo(() => sortNotes(flattenPages(query.data?.pages)).slice(0, NOTES_LIMIT), [query.data]); // data-patterns: server-order

  return (
    <section aria-labelledby={headingId} className="anim-in flex min-w-0 flex-col gap-3.5" style={stagger(4)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-[17px] font-semibold">
          Notas
        </h2>
        <Link href={NOTES_HREF} className="text-[13px] text-muted-foreground hover:text-foreground">
          Ver todas →
        </Link>
      </div>
      {query.isPending ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[120px] rounded-lg" />
          ))}
        </div>
      ) : query.isError ? (
        <Card className="px-5 py-4">
          <SectionError onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {notes.map((note) => (
            <li key={note.id}>
              <NoteTile note={note} now={now} />
            </li>
          ))}
          {MY_SPACE.createNoteAction ? (
            <li>
              <button
                type="button"
                onClick={() => replaceMiEspacioParam(NOTE_PARAM, NEW_NOTE)}
                className="lift flex min-h-[120px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground"
              >
                <Plus aria-hidden="true" className="size-4" />
                Nueva nota
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}

function NoteTile({ note, now }: { note: Note; now: Date }) {
  return (
    <button
      type="button"
      onClick={() => replaceMiEspacioParam(NOTE_PARAM, note.id)}
      className={`lift flex min-h-[120px] w-full flex-col gap-1.5 rounded-lg p-4 text-left ${TINT_14}`}
      style={tint(NOTE_COLOR_TINT[note.color])}
    >
      <span className="line-clamp-2 text-sm font-semibold">{note.title || "Sin título"}</span>
      <span className="line-clamp-3 text-[13px] text-foreground">{note.body}</span>
      <span className="mt-auto font-mono text-[11.5px] text-muted-foreground">{noteDayLabel(note.updatedAt, now)}</span>
    </button>
  );
}

// ── Horas ────────────────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const WEEKDAY_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes"];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** "+2 vs. anterior", "−1.5 vs. anterior" (U+2212), "= vs. anterior". */
export function hoursDeltaText(delta: number): string {
  const d = round1(delta);
  if (d === 0) return "= vs. anterior";
  return d > 0 ? `+${d} vs. anterior` : `−${Math.abs(d)} vs. anterior`;
}

/** The chart's label: "Horas por día de la semana pasada: lunes 7.5, …. Meta 8 h." */
export function hoursChartLabel(week: WeekHours, hoursPerDay: number): string {
  const days = week.days
    .slice(0, 5)
    .map((day, i) => `${WEEKDAY_LONG[i]} ${round1(day.hours)}`)
    .join(", ");
  return `Horas por día de la semana pasada: ${days}. Meta ${hoursPerDay} h.`;
}

function HoursPanel({ today, hoursPerDay }: { today: string; hoursPerDay: number }) {
  const headingId = useId();
  const lastMonday = addDays(mondayOf(today), -7);
  const mondayBefore = addDays(mondayOf(today), -14);
  const last = useQuery(meWeekHoursOptions(lastMonday));
  const before = useQuery(meWeekHoursOptions(mondayBefore));

  return (
    <Card className="anim-in flex min-w-0 flex-col gap-4 px-5 py-[18px]" style={stagger(5)}>
      <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4">
        <h2 id={headingId} className="text-base font-semibold">
          Horas · semana pasada
        </h2>
        {last.isPending ? (
          <Skeleton className="h-[220px]" />
        ) : last.isError ? (
          <SectionError onRetry={() => void last.refetch()} />
        ) : (
          <HoursChart week={last.data} previous={before.data ?? null} hoursPerDay={hoursPerDay} />
        )}
      </section>
    </Card>
  );
}

function HoursChart({ week, previous, hoursPerDay }: { week: WeekHours; previous: WeekHours | null; hoursPerDay: number }) {
  const days = week.days.slice(0, 5);
  const max = Math.max(hoursPerDay * 1.375, ...days.map((d) => d.hours), 1);
  const delta = previous ? week.total - previous.total : null;
  const pct = (value: number) => `${Math.min(100, (value / max) * 100)}%`;

  return (
    <>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[22px] font-semibold">{round1(week.total)} h</span>
        {delta !== null ? (
          <span className={`font-mono text-[12.5px] ${round1(delta) < 0 ? "text-warning" : "text-success"}`}>
            {hoursDeltaText(delta)}
          </span>
        ) : null}
      </div>
      <div role="img" aria-label={hoursChartLabel(week, hoursPerDay)} className="flex flex-col gap-2">
        <div className="relative h-[176px]">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-dashed border-primary"
            style={{ bottom: pct(hoursPerDay) }}
          >
            <span className="absolute right-0 -top-5 font-mono text-[11px] text-primary">meta {hoursPerDay} h</span>
          </div>
          <div aria-hidden="true" className="flex h-full items-end gap-[22px]">
            {days.map((day, i) => (
              <div key={day.date} className="flex h-full flex-1 items-end">
                <div
                  className="grow w-full rounded-t-sm bg-chart-1"
                  style={{ height: pct(day.hours), ...stagger(i) }}
                />
              </div>
            ))}
          </div>
        </div>
        <div aria-hidden="true" className="flex gap-[22px]">
          {days.map((day, i) => (
            <span key={day.date} className="flex-1 text-center font-mono text-[11px] text-muted-foreground uppercase">
              {WEEKDAY_SHORT[i]}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
