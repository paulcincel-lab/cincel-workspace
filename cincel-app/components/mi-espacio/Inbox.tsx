"use client";

import {
  AtSign,
  BadgeCheck,
  Bell,
  CalendarClock,
  CheckCheck,
  Info,
  Mail,
  MessageSquare,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shell/EmptyState";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { RecordTable } from "@/components/widgets/RecordTable";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import {
  createTaskFromGmailThreadAction,
  fetchGmailThreadsAction,
  linkGmailThreadToProjectAction,
} from "@/lib/actions/gmail-actions";
import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { fetchNotificationsAction, markNotificationsReadAction } from "@/lib/actions/notifications-actions";
import { IMPLEMENTED as NOTIFICATIONS_IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { actionErrorText } from "@/lib/errors";
import {
  INBOX_TABS,
  appendUnique,
  formatInboxDateTime,
  formatInboxTime,
  gmailSyncLabel,
  inboxCounts,
  inboxRows,
  inboxTabSearch,
  mergeNotifications,
  rowOrigin,
  rowSender,
  rowSnippet,
  rowSubject,
  type InboxRow,
  type InboxTab,
} from "@/lib/my-space/inbox";
import { setShellBadgesUnread } from "@/lib/query/options/shell";
import type { GmailStatus, GmailThreadSummary, NotificationItem, NotificationKind } from "@/lib/types/redesign";
import type { RecordTableData } from "@/lib/types/widgets";

import { THREAD_PARAM, replaceMiEspacioParam } from "./search-params";

export type InboxProps = {
  notifications: { items: NotificationItem[]; nextCursor: string | null; unreadCount: number };
  gmail: { status: GmailStatus; threads: GmailThreadSummary[]; nextCursor: string | null } | null;
  tab: "todo" | "gmail" | "notificaciones" | "menciones";
  /**
   * Opens the Gmail reading pane. Without it, a Gmail row sets `?correo=<id>`
   * on the current URL (`THREAD_PARAM`), which `MiEspacioClient` reads.
   */
  onOpenThread?(threadId: string): void;
};

/** Bandeja poll interval while the document is visible (FE §6). */
export const INBOX_POLL_MS = 60_000;

const INTEGRATIONS_HREF = "/ajustes/integraciones";

// Entry points stay hidden while the backing action is a stub (FE §9, §20 Rule 1).
const CAN_POLL: boolean = NOTIFICATIONS_IMPLEMENTED.fetchNotificationsAction;
const CAN_MARK_READ: boolean = NOTIFICATIONS_IMPLEMENTED.markNotificationsReadAction;
const GMAIL_ON: boolean = GMAIL_IMPLEMENTED.fetchGmailStatusAction && GMAIL_IMPLEMENTED.fetchGmailThreadsAction;
const CAN_OPEN_THREAD: boolean = GMAIL_ON && GMAIL_IMPLEMENTED.fetchGmailThreadAction;
const CAN_LINK: boolean = GMAIL_ON && GMAIL_IMPLEMENTED.linkGmailThreadToProjectAction;
const CAN_CREATE_TASK: boolean = GMAIL_ON && GMAIL_IMPLEMENTED.createTaskFromGmailThreadAction;

/** Copy for a Gmail action error: `RATE_LIMITED` takes the Gmail wording (FE §9), the rest the shared copy. */
function gmailErrorText(err: unknown): string {
  return actionErrorText(err, "gmail");
}

/** Icon and token tint of the 34 px chip per source (tints of FE §14.5). */
const KIND_CHIP: Record<NotificationKind | "gmail", { icon: LucideIcon; tint: string }> = {
  gmail: { icon: Mail, tint: "tint-chart-1 ink-chart-1" },
  mencion: { icon: AtSign, tint: "tint-chart-2 ink-chart-2" },
  asignacion: { icon: UserPlus, tint: "tint-chart-3 ink-chart-3" },
  comentario: { icon: MessageSquare, tint: "tint-chart-4 ink-chart-4" },
  vencimiento: { icon: CalendarClock, tint: "tint-chart-5 ink-chart-5" },
  aprobacion_cliente: { icon: BadgeCheck, tint: "tint-chart-1 ink-chart-1" },
  recordatorio: { icon: Bell, tint: "tint-chart-3 ink-chart-3" },
  sistema: { icon: Info, tint: "bg-muted text-muted-foreground" },
};

/**
 * Bandeja columns (FE §3.3): one rich column for Visual, one plain column for
 * Esencial and the Analítico table (Origen, De, Asunto, Proyecto, Recibido,
 * Estado). `RecordTable` drops the columns hidden for the current style.
 */
const INBOX_COLUMNS: RecordTableData["columns"] = [
  { key: "item", label: "Bandeja", hideOn: ["esencial", "analitico"] },
  { key: "plain", label: "Bandeja", hideOn: ["visual", "analitico"] },
  { key: "origen", label: "Origen", hideOn: ["visual", "esencial"] },
  { key: "de", label: "De", hideOn: ["visual", "esencial"] },
  { key: "asunto", label: "Asunto", hideOn: ["visual", "esencial"] },
  { key: "proyecto", label: "Proyecto", hideOn: ["visual", "esencial"] },
  { key: "recibido", label: "Recibido", mono: true, hideOn: ["visual", "esencial"] },
  { key: "estado", label: "Estado", hideOn: ["visual", "esencial"] },
];

type ProjectOption = { id: string; name: string; status: string };
type Panel = { threadId: string; mode: "link" | "task" };

/**
 * Bandeja (redesign FE §3.3, §4.4, §6): Cincel notifications and the person's
 * Gmail threads in one list with tabs Todo / Gmail / Notificaciones /
 * Menciones; opening a notification marks it read; a 60 s poll runs while the
 * document is visible and keeps the sidebar badge fresh; Gmail rows offer
 * "Crear tarea" and "Vincular a proyecto". Every presentation style renders
 * through `RecordTable`.
 */
export function Inbox(props: InboxProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { onOpenThread } = props;

  const [tab, setTab] = useState<InboxTab>(props.tab);
  const [items, setItems] = useState(props.notifications.items);
  const [nextCursor, setNextCursor] = useState(props.notifications.nextCursor);
  const [unreadCount, setUnreadCount] = useState(props.notifications.unreadCount);
  const [threads, setThreads] = useState<GmailThreadSummary[]>(props.gmail?.threads ?? []);
  const [gmailCursor, setGmailCursor] = useState<string | null>(props.gmail?.nextCursor ?? null);
  const [now, setNow] = useState(() => new Date());
  const [loadingMore, setLoadingMore] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);

  // A server refresh (revalidatePath, navigation) hands new data: start from it
  // (state adjusted during render, React's pattern for props that reset state).
  const server = {
    tab: props.tab,
    items: props.notifications.items,
    cursor: props.notifications.nextCursor,
    unread: props.notifications.unreadCount,
    threads: props.gmail?.threads,
    gmailCursor: props.gmail?.nextCursor ?? null,
  };
  const [synced, setSynced] = useState(server);
  if (synced.tab !== server.tab) {
    setSynced((s) => ({ ...s, tab: server.tab }));
    setTab(server.tab);
  }
  if (synced.items !== server.items || synced.cursor !== server.cursor || synced.unread !== server.unread) {
    setSynced((s) => ({ ...s, items: server.items, cursor: server.cursor, unread: server.unread }));
    setItems(server.items);
    setNextCursor(server.cursor);
    setUnreadCount(server.unread);
  }
  if (synced.threads !== server.threads || synced.gmailCursor !== server.gmailCursor) {
    setSynced((s) => ({ ...s, threads: server.threads, gmailCursor: server.gmailCursor }));
    setThreads(server.threads ?? []);
    setGmailCursor(server.gmailCursor);
  }

  const status = props.gmail?.status ?? null;
  const gmailConnected = GMAIL_ON && status !== null && status.connected && status.scopeOk;
  const visibleThreads = useMemo(() => (gmailConnected ? threads : []), [gmailConnected, threads]);

  // The Mi espacio badge reads `shell.badges`: the Bandeja's own count patches it at once.
  const setUnread = useCallback(
    (count: number) => {
      setUnreadCount(count);
      setShellBadgesUnread(queryClient, count);
    },
    [queryClient],
  );

  // 60 s poll, only while the document is visible (FE §6).
  useEffect(() => {
    if (!CAN_POLL) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const page = await fetchNotificationsAction({ unreadOnly: true });
        if (cancelled) return;
        const polledIds = new Set(page.items.map((n) => n.id));
        const readAt = new Date().toISOString();
        setItems((current) => {
          // A complete unread page means every other loaded unread row was read elsewhere.
          const base =
            page.nextCursor === null
              ? current.map((n) => (n.readAt === null && !polledIds.has(n.id) ? { ...n, readAt } : n))
              : current;
          return mergeNotifications(base, page.items);
        });
        setUnread(page.unreadCount);
        setNow(new Date());
      } catch {
        // Keep the current list; the next tick retries.
      }
    };
    const start = () => {
      if (timer === null) timer = setInterval(() => void poll(), INBOX_POLL_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void poll();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [setUnread]);

  // Project names for the suggested / linked chips and the picker (loaded once, on demand).
  const needsProjects =
    (CAN_LINK || CAN_CREATE_TASK) &&
    (panel !== null || visibleThreads.some((t) => t.projectId !== null || t.suggestedProjectId !== null));
  useEffect(() => {
    if (!needsProjects || projects !== null) return;
    let cancelled = false;
    fetchProjectsAction({})
      .then((list) => {
        if (!cancelled) setProjects(list.map((p) => ({ id: p.id, name: p.name, status: p.status })));
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [needsProjects, projects]);

  const projectName = useCallback(
    (id: string | null) => (id ? (projects?.find((p) => p.id === id)?.name ?? null) : null),
    [projects],
  );

  const markRead = useCallback(
    (item: NotificationItem) => {
      if (item.readAt !== null || !CAN_MARK_READ) return;
      const readAt = new Date().toISOString();
      setItems((current) => current.map((n) => (n.id === item.id ? { ...n, readAt } : n)));
      setUnreadCount((count) => {
        const next = Math.max(0, count - 1);
        setShellBadgesUnread(queryClient, next);
        return next;
      });
      markNotificationsReadAction([item.id])
        .then((result) => setUnread(result.unreadCount))
        .catch((err: unknown) => {
          setItems((current) => current.map((n) => (n.id === item.id ? { ...n, readAt: null } : n)));
          setUnreadCount((count) => {
            const next = count + 1;
            setShellBadgesUnread(queryClient, next);
            return next;
          });
          toast.error(actionErrorText(err));
        });
    },
    [queryClient, setUnread],
  );

  const openThread = useCallback(
    (thread: GmailThreadSummary) => {
      if (!CAN_OPEN_THREAD) return;
      // Reading the thread marks it read on the server (fetchGmailThreadAction).
      setThreads((current) => current.map((t) => (t.id === thread.id ? { ...t, unread: false } : t)));
      if (onOpenThread) onOpenThread(thread.id);
      else replaceMiEspacioParam(THREAD_PARAM, thread.id);
    },
    [onOpenThread],
  );

  const counts = inboxCounts({ notifications: items, unreadCount, threads: visibleThreads });
  const tabs = INBOX_TABS.filter((t) => t.key !== "gmail" || GMAIL_ON);
  const activeTab: InboxTab = tab === "gmail" && !GMAIL_ON ? "todo" : tab;
  const rows = inboxRows(activeTab, items, visibleThreads);
  const nothingUnread = rows.every((r) => !r.unread);
  const rowByKey = new Map(rows.map((r) => [r.key, r]));

  const showGmailConnect = activeTab === "gmail" && !gmailConnected;
  const canLoadNotifications = activeTab !== "gmail" && nextCursor !== null && CAN_POLL;
  const canLoadThreads = (activeTab === "todo" || activeTab === "gmail") && gmailConnected && gmailCursor !== null;

  async function loadMore() {
    setLoadingMore(true);
    try {
      if (canLoadNotifications && nextCursor) {
        try {
          const page = await fetchNotificationsAction({ cursor: nextCursor });
          setItems((current) => appendUnique(current, page.items));
          setNextCursor(page.nextCursor);
          setUnread(page.unreadCount);
        } catch (err) {
          toast.error(actionErrorText(err));
        }
      }
      if (canLoadThreads && gmailCursor) {
        try {
          const page = await fetchGmailThreadsAction({ cursor: gmailCursor });
          setThreads((current) => appendUnique(current, page.threads));
          setGmailCursor(page.nextCursor);
        } catch (err) {
          toast.error(gmailErrorText(err));
        }
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const tabHref = (key: InboxTab) => `${pathname ?? ""}${inboxTabSearch(searchParams?.toString() ?? "", key)}`;

  const tableData: RecordTableData = {
    columns: INBOX_COLUMNS,
    rows: rows.map((row) => ({
      id: row.key,
      origen: rowOrigin(row),
      de: rowSender(row),
      asunto: rowSubject(row),
      proyecto: row.source === "gmail" ? (projectName(row.thread.projectId) ?? "") : "",
      recibido: formatInboxDateTime(row.at),
      estado: row.unread ? "Sin leer" : "Leído",
    })),
  };

  const gmailActions = (thread: GmailThreadSummary, plain: boolean) => (
    <GmailRowActions
      thread={thread}
      plain={plain}
      linkedName={projectName(thread.projectId)}
      suggestedName={projectName(thread.suggestedProjectId)}
      onOpenPanel={(mode) => setPanel({ threadId: thread.id, mode })}
    />
  );

  const renderCell = (columnKey: string, record: Record<string, unknown>): ReactNode | undefined => {
    const row = rowByKey.get(String(record.id));
    if (!row) return undefined;
    switch (columnKey) {
      case "item":
        return (
          <VisualRow row={row} now={now} onMarkRead={markRead} onOpenThread={openThread}>
            {row.source === "gmail" ? gmailActions(row.thread, false) : null}
          </VisualRow>
        );
      case "plain":
        return (
          <PlainRow row={row} now={now} onMarkRead={markRead} onOpenThread={openThread}>
            {row.source === "gmail" ? gmailActions(row.thread, true) : null}
          </PlainRow>
        );
      case "asunto":
        return <RowOpener row={row} onMarkRead={markRead} onOpenThread={openThread} />;
      case "proyecto":
        return row.source === "gmail" ? gmailActions(row.thread, true) : undefined;
      case "estado":
        return row.unread ? <span className="font-semibold">Sin leer</span> : "Leído";
      default:
        return undefined;
    }
  };

  const panelThread = panel ? (threads.find((t) => t.id === panel.threadId) ?? null) : null;

  const chip = !GMAIL_ON ? null : gmailConnected && status ? (
    <Badge variant="success">{gmailSyncLabel(status.lastSyncedAt, now)}</Badge>
  ) : (
    <Link href={INTEGRATIONS_HREF} className={buttonVariants({ variant: "outline", size: "sm" })}>
      Conectar Gmail
    </Link>
  );

  return (
    <WidgetCard title="Bandeja" icon={Mail} actions={chip}>
      <div className="flex flex-col gap-3">
        <nav aria-label="Pestañas de la bandeja">
          <Tabs value={activeTab}>
            <TabsList variant="line">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  nativeButton={false}
                  render={
                    <Link
                      href={tabHref(t.key)}
                      scroll={false}
                      aria-current={t.key === activeTab ? "page" : undefined}
                      onClick={() => setTab(t.key)}
                    />
                  }
                >
                  {t.label}
                  {counts[t.key] > 0 ? (
                    <Badge variant="secondary" data-testid={`inbox-count-${t.key}`}>
                      {counts[t.key]}
                      <span className="sr-only"> sin leer</span>
                    </Badge>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </nav>

        {showGmailConnect ? (
          <EmptyState
            icon={Mail}
            title="Conectar Gmail"
            description={
              status?.connected && !status.scopeOk
                ? actionErrorText("SCOPE_MISSING")
                : "Conecta tu correo para ver tus hilos en la bandeja."
            }
            action={{ label: "Conectar Gmail", href: INTEGRATIONS_HREF }}
          />
        ) : (
          <>
            {nothingUnread ? (
              <EmptyState
                icon={CheckCheck}
                title="Todo al día"
                description="No tienes notificaciones ni correos sin leer."
              />
            ) : null}
            {rows.length > 0 ? <RecordTable data={tableData} renderCell={renderCell} /> : null}
            {canLoadNotifications || canLoadThreads ? (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? "Cargando…" : "Cargar más"}
                </Button>
              </div>
            ) : null}
          </>
        )}

        {panel && panelThread ? (
          <ThreadPanel
            key={`${panel.threadId}:${panel.mode}`}
            mode={panel.mode}
            thread={panelThread}
            projects={projects}
            onClose={() => setPanel(null)}
            onLinked={(projectId) =>
              setThreads((current) => current.map((t) => (t.id === panelThread.id ? { ...t, projectId } : t)))
            }
            onOpenTask={(taskId) => router.push(`/tareas?tarea=${encodeURIComponent(taskId)}`)}
          />
        ) : null}

        {GMAIL_ON ? (
          <footer className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <p>Los correos con el nombre de un proyecto se sugieren para vincular.</p>
            <Link href={INTEGRATIONS_HREF} className={buttonVariants({ variant: "link", size: "sm" })}>
              Ajustes de Gmail
            </Link>
          </footer>
        ) : null}
      </div>
    </WidgetCard>
  );
}

type RowHandlers = {
  onMarkRead(item: NotificationItem): void;
  onOpenThread(thread: GmailThreadSummary): void;
};

const OPENER_CLASS =
  "text-left text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The subject as the row's link / button: a notification goes to its `url` and marks read; a thread opens the reader. */
function RowOpener({ row, onMarkRead, onOpenThread, className }: RowHandlers & { row: InboxRow; className?: string }) {
  const subject = rowSubject(row);
  const weight = row.unread ? "font-semibold" : "font-normal";
  const cls = `${weight} ${OPENER_CLASS} ${className ?? ""}`;
  const unreadMark = row.unread ? <span className="sr-only">Sin leer: </span> : null;

  if (row.source === "notification") {
    const item = row.item;
    if (item.url) {
      return (
        <Link href={item.url} className={cls} onClick={() => onMarkRead(item)}>
          {unreadMark}
          {subject}
        </Link>
      );
    }
    return (
      <button type="button" className={cls} onClick={() => onMarkRead(item)}>
        {unreadMark}
        {subject}
      </button>
    );
  }
  if (!CAN_OPEN_THREAD) {
    return (
      <span className={`${weight} text-foreground ${className ?? ""}`}>
        {unreadMark}
        {subject}
      </span>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => onOpenThread(row.thread)}>
      {unreadMark}
      {subject}
    </button>
  );
}

/** Visual row: 34 px icon chip, sender, mono time, subject, snippet, source chip and the Gmail actions. */
function VisualRow({ row, now, children, ...handlers }: RowHandlers & { row: InboxRow; now: Date; children?: ReactNode }) {
  const chip = KIND_CHIP[row.source === "gmail" ? "gmail" : row.item.kind];
  const Icon = chip.icon;
  const snippet = rowSnippet(row);
  return (
    <div className="flex gap-3 py-1">
      <span aria-hidden className={`flex size-[34px] shrink-0 items-center justify-center rounded-[10px] ${chip.tint}`}>
        <Icon className="size-4" strokeWidth={1.8} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="truncate text-muted-foreground">{rowSender(row)}</span>
          <time dateTime={row.at} suppressHydrationWarning className="shrink-0 font-mono text-xs text-muted-foreground">
            {formatInboxTime(row.at, now)}
          </time>
        </div>
        <RowOpener row={row} {...handlers} className="truncate text-sm" />
        {snippet ? <p className="line-clamp-2 text-sm text-muted-foreground">{snippet}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant={row.source === "gmail" ? "outline" : "secondary"}>{rowOrigin(row)}</Badge>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Esencial row: plain 15 px text, no chips. */
function PlainRow({ row, now, children, ...handlers }: RowHandlers & { row: InboxRow; now: Date; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1 text-[15px]">
      <RowOpener row={row} {...handlers} />
      <p className="text-[13px] text-muted-foreground">
        {rowSender(row)} · {rowOrigin(row)} ·{" "}
        <time dateTime={row.at} suppressHydrationWarning className="font-mono">
          {formatInboxTime(row.at, now)}
        </time>
      </p>
      {children}
    </div>
  );
}

/** Suggested / linked project and the "Crear tarea" / "Vincular a proyecto" actions of a Gmail row. */
function GmailRowActions({
  thread,
  plain,
  linkedName,
  suggestedName,
  onOpenPanel,
}: {
  thread: GmailThreadSummary;
  /** Text links instead of chips (Esencial row, Analítico cell). */
  plain: boolean;
  linkedName: string | null;
  suggestedName: string | null;
  onOpenPanel(mode: "link" | "task"): void;
}) {
  const linkedHref = thread.projectId ? `/proyectos/${encodeURIComponent(thread.projectId)}` : null;
  const suggested = linkedHref === null && thread.suggestedProjectId !== null;
  const linkedLabel = linkedName ?? "Proyecto vinculado";
  const suggestedLabel = `Sugerido: ${suggestedName ?? "un proyecto"}`;
  const variant = plain ? "link" : "outline";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {linkedHref ? (
        plain ? (
          <Link href={linkedHref} className={buttonVariants({ variant: "link", size: "xs" })}>
            {linkedLabel}
          </Link>
        ) : (
          <Badge variant="secondary" render={<Link href={linkedHref} />}>
            {linkedLabel}
          </Badge>
        )
      ) : null}
      {suggested && CAN_LINK ? (
        plain ? (
          <Button variant="link" size="xs" onClick={() => onOpenPanel("link")}>
            {suggestedLabel}
          </Button>
        ) : (
          <Badge variant="outline" render={<button type="button" onClick={() => onOpenPanel("link")} />}>
            {suggestedLabel}
          </Badge>
        )
      ) : suggested ? (
        <span className="text-sm text-muted-foreground">{suggestedLabel}</span>
      ) : null}
      {CAN_CREATE_TASK ? (
        <Button variant={variant} size="xs" onClick={() => onOpenPanel("task")}>
          Crear tarea
        </Button>
      ) : null}
      {CAN_LINK ? (
        <Button variant={variant} size="xs" onClick={() => onOpenPanel("link")}>
          Vincular a proyecto
        </Button>
      ) : null}
    </div>
  );
}

/** The small project picker of "Crear tarea" and "Vincular a proyecto" (one at a time, under the list). */
function ThreadPanel({
  mode,
  thread,
  projects,
  onClose,
  onLinked,
  onOpenTask,
}: {
  mode: "link" | "task";
  thread: GmailThreadSummary;
  projects: ProjectOption[] | null;
  onClose(): void;
  onLinked(projectId: string | null): void;
  onOpenTask(taskId: string): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [projectId, setProjectId] = useState<string | null>(thread.projectId ?? thread.suggestedProjectId);
  const [title, setTitle] = useState(thread.subject);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const options = (projects ?? []).filter((p) => p.status === "activo" || p.status === "pausado" || p.id === projectId);
  const items = Object.fromEntries(options.map((p) => [p.id, p.name]));
  const nameOf = (id: string) => options.find((p) => p.id === id)?.name ?? "el proyecto";
  const heading = mode === "link" ? "Vincular a proyecto" : "Crear tarea";
  const fieldId = `inbox-${mode}-${thread.id}`;

  async function submit() {
    if (!projectId) return;
    setPending(true);
    setError(null);
    try {
      if (mode === "link") {
        await linkGmailThreadToProjectAction(thread.id, projectId);
        onLinked(projectId);
        toast.success(`Correo vinculado a ${nameOf(projectId)}`);
      } else {
        const { taskId } = await createTaskFromGmailThreadAction(thread.id, {
          projectId,
          title: title.trim() || undefined,
        });
        onLinked(projectId);
        toast.success("Tarea creada", { action: { label: "Abrir", onClick: () => onOpenTask(taskId) } });
      }
      onClose();
    } catch (err) {
      setError(gmailErrorText(err));
    } finally {
      setPending(false);
    }
  }

  async function unlink() {
    setPending(true);
    setError(null);
    try {
      await linkGmailThreadToProjectAction(thread.id, null);
      onLinked(null);
      toast.success("Vínculo quitado");
      onClose();
    } catch (err) {
      setError(gmailErrorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-labelledby={`${fieldId}-heading`}
      className="flex flex-col gap-3 rounded-[10px] border border-border p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div>
        <p id={`${fieldId}-heading`} className="text-sm font-semibold">
          {heading}
        </p>
        <p className="truncate text-sm text-muted-foreground">{thread.subject}</p>
      </div>
      {mode === "link" ? (
        <p className="text-sm text-muted-foreground">El asunto del correo quedará en la bitácora del proyecto.</p>
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${fieldId}-project`}>Proyecto</Label>
        <Select
          items={items}
          value={projectId}
          disabled={pending || projects === null}
          onValueChange={(v) => setProjectId(typeof v === "string" ? v : null)}
        >
          <SelectTrigger id={`${fieldId}-project`} className="w-full">
            <SelectValue placeholder={projects === null ? "Cargando proyectos…" : "Elige un proyecto"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {mode === "task" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${fieldId}-title`}>Título</Label>
          <Input id={`${fieldId}-title`} value={title} disabled={pending} onChange={(e) => setTitle(e.target.value)} />
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        {mode === "link" && thread.projectId ? (
          <Button variant="outline" size="sm" onClick={() => void unlink()} disabled={pending}>
            Quitar vínculo
          </Button>
        ) : null}
        <Button size="sm" onClick={() => void submit()} disabled={pending || !projectId}>
          {mode === "link" ? "Vincular" : "Crear tarea"}
        </Button>
      </div>
    </div>
  );
}
