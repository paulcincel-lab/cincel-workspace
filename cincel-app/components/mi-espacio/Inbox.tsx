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
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
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
import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { markNotificationsReadAction } from "@/lib/actions/notifications-actions";
import { IMPLEMENTED as NOTIFICATIONS_IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import { actionErrorText } from "@/lib/errors";
import {
  INBOX_TABS,
  INBOX_TAB_PARAM,
  formatInboxDateTime,
  formatInboxTime,
  gmailSyncLabel,
  inboxCounts,
  inboxRows,
  inboxTabSearch,
  parseInboxTab,
  rowOrigin,
  rowSender,
  rowSnippet,
  rowSubject,
  type InboxRow,
  type InboxTab,
} from "@/lib/my-space/inbox";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { catalogOptions } from "@/lib/query/options/catalog";
import {
  ME_NOTIFICATIONS_REFETCH_MS,
  markCachedNotificationsRead,
  meGmailStatusOptions,
  meGmailThreadsOptions,
  meNotificationsOptions,
  restoreSnapshot,
  snapshotNotifications,
  type NotificationsData,
  type Snapshot,
} from "@/lib/query/options/mi-espacio";
import type { CatalogProjectOption } from "@/lib/types/catalog";
import type { GmailThreadSummary, NotificationItem, NotificationKind } from "@/lib/types/redesign";
import type { ShellBadges } from "@/lib/types/shell";
import type { RecordTableData } from "@/lib/types/widgets";

import { THREAD_PARAM, replaceMiEspacioParam } from "./search-params";
import { useCreateTaskFromGmailThread, useLinkGmailThread } from "./use-gmail-mutations";

export type InboxProps = {
  /**
   * Opens the Gmail reading pane. Without it, a Gmail row sets `?correo=<id>`
   * on the current URL (`THREAD_PARAM`), which `MiEspacioClient` reads.
   */
  onOpenThread?(threadId: string): void;
};

/** Bandeja refresh interval while the page is mounted and visible (FE §6): `me.notifications`' `refetchInterval`. */
export const INBOX_POLL_MS = ME_NOTIFICATIONS_REFETCH_MS;

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

type ProjectOption = Pick<CatalogProjectOption, "id" | "name" | "status">;
type Panel = { threadId: string; mode: "link" | "task" };
type MarkReadSnapshot = { list: Snapshot<NotificationsData>; badges: ShellBadges | undefined };

/** Every item of the loaded pages, without repeats (a refetch can shift rows between pages). */
function uniqueById<T extends { id: string }>(lists: readonly T[][]): T[] {
  const seen = new Set<string>();
  return lists.flat().filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

/** A plain left click (no modifier): the tab switches in place; other clicks keep the link's default. */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * Bandeja (redesign FE §3.3, §4.4, §6): Cincel notifications and the person's
 * Gmail threads in one list with tabs Todo / Gmail / Notificaciones /
 * Menciones. The tab is the URL only (`?bandeja=`). The lists are the
 * `me.notifications` and `me.gmail.threads` infinite queries; notifications
 * refetch every 60 s while the page is visible and each fetch updates the
 * sidebar badge (`shell.badges`). Opening a notification marks it read
 * (optimistic, with the server's count after). Gmail rows offer "Crear
 * tarea" and "Vincular a proyecto". Every presentation style renders through
 * `RecordTable`.
 */
export function Inbox({ onOpenThread }: InboxProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab = parseInboxTab(searchParams?.get(INBOX_TAB_PARAM));
  const [panel, setPanel] = useState<Panel | null>(null);

  const notificationsQuery = useInfiniteQuery({ ...meNotificationsOptions(), enabled: CAN_POLL });
  const statusQuery = useQuery({ ...meGmailStatusOptions(), enabled: GMAIL_ON });
  const status = statusQuery.data ?? null;
  const gmailConnected = GMAIL_ON && status !== null && status.connected && status.scopeOk;
  const threadsQuery = useInfiniteQuery({ ...meGmailThreadsOptions(), enabled: gmailConnected });

  const notificationPages = notificationsQuery.data?.pages;
  const items = useMemo(() => uniqueById((notificationPages ?? []).map((p) => p.items)), [notificationPages]);
  const unreadCount = notificationPages?.[0]?.unreadCount ?? 0;
  const threadPages = threadsQuery.data?.pages;
  const threads = useMemo(() => uniqueById((threadPages ?? []).map((p) => p.threads)), [threadPages]);
  const visibleThreads = useMemo(() => (gmailConnected ? threads : []), [gmailConnected, threads]);

  // Relative times ("hace 5 min") move on with every refresh of the list.
  const [mountedAt] = useState(() => Date.now());
  const now = new Date(Math.max(mountedAt, notificationsQuery.dataUpdatedAt));

  // Project names for the suggested / linked chips and the picker: the shared light catalog, loaded once.
  const needsProjects =
    (CAN_LINK || CAN_CREATE_TASK) &&
    (panel !== null || visibleThreads.some((t) => t.projectId !== null || t.suggestedProjectId !== null));
  const projectsQuery = useQuery({ ...catalogOptions.projectOptions(), enabled: needsProjects });
  const projects = useMemo<ProjectOption[] | null>(
    () => projectsQuery.data ?? (projectsQuery.isError ? [] : null),
    [projectsQuery.data, projectsQuery.isError],
  );

  const projectName = useCallback(
    (id: string | null) => (id ? (projects?.find((p) => p.id === id)?.name ?? null) : null),
    [projects],
  );

  // Optimistic: the row and both counters drop at once; the server's count replaces it, an error rolls back.
  const markReadMutation = useActionMutation<string[], { unreadCount: number }, MarkReadSnapshot>(
    markNotificationsReadAction,
    {
      optimistic: {
        async onMutate(qc, ids) {
          const list = await snapshotNotifications(qc);
          const badges = qc.getQueryData<ShellBadges>(qk.shell.badges());
          markCachedNotificationsRead(qc, ids, (count) => count - ids.length);
          return { list, badges };
        },
        rollback(qc, snap) {
          restoreSnapshot(qc, snap.list);
          if (snap.badges) qc.setQueryData(qk.shell.badges(), snap.badges);
        },
      },
      setData: (qc, { unreadCount: count }, ids) => markCachedNotificationsRead(qc, ids, count),
      // "Bandeja por tipo" (Analítico) counts per kind on the server: refetch it after the write.
      invalidate: [qk.me.notificationsSummary()],
    },
  );
  const { mutate: markReadIds } = markReadMutation;

  const markRead = useCallback(
    (item: NotificationItem) => {
      if (item.readAt !== null || !CAN_MARK_READ) return;
      markReadIds([item.id]);
    },
    [markReadIds],
  );

  const openThread = useCallback(
    (thread: GmailThreadSummary) => {
      if (!CAN_OPEN_THREAD) return;
      // The reading pane marks an unread thread read (`markGmailThreadReadAction`).
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
  const canLoadNotifications = activeTab !== "gmail" && CAN_POLL && notificationsQuery.hasNextPage;
  const canLoadThreads = (activeTab === "todo" || activeTab === "gmail") && gmailConnected && threadsQuery.hasNextPage;
  const loadingMore = notificationsQuery.isFetchingNextPage || threadsQuery.isFetchingNextPage;

  async function loadMore() {
    const [notificationsResult, threadsResult] = await Promise.all([
      canLoadNotifications ? notificationsQuery.fetchNextPage() : null,
      canLoadThreads ? threadsQuery.fetchNextPage() : null,
    ]);
    if (notificationsResult?.isError) toast.error(actionErrorText(notificationsResult.error));
    if (threadsResult?.isError) toast.error(gmailErrorText(threadsResult.error));
  }

  function selectTab(event: MouseEvent<HTMLAnchorElement>, key: InboxTab) {
    if (!isPlainClick(event)) return;
    // URL only, without a navigation (no server round trip): `useSearchParams` follows `replaceState`.
    event.preventDefault();
    replaceMiEspacioParam(INBOX_TAB_PARAM, key === "todo" ? null : key);
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
                      onClick={(event) => selectTab(event, t.key)}
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
  onOpenTask,
}: {
  mode: "link" | "task";
  thread: GmailThreadSummary;
  projects: ProjectOption[] | null;
  onClose(): void;
  onOpenTask(taskId: string): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [projectId, setProjectId] = useState<string | null>(thread.projectId ?? thread.suggestedProjectId);
  const [title, setTitle] = useState(thread.subject);
  const [error, setError] = useState<string | null>(null);
  // Both write the thread's project into `me.gmail` and refresh the projects they touch.
  const linkMutation = useLinkGmailThread({ onFormError: setError });
  const taskMutation = useCreateTaskFromGmailThread({ onFormError: setError });
  const pending = linkMutation.isPending || taskMutation.isPending;

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const options = (projects ?? []).filter((p) => p.status === "activo" || p.status === "pausado" || p.id === projectId);
  const items = Object.fromEntries(options.map((p) => [p.id, p.name]));
  const nameOf = (id: string) => options.find((p) => p.id === id)?.name ?? "el proyecto";
  const heading = mode === "link" ? "Vincular a proyecto" : "Crear tarea";
  const fieldId = `inbox-${mode}-${thread.id}`;

  function submit() {
    if (!projectId) return;
    setError(null);
    const previousProjectId = thread.projectId;
    if (mode === "link") {
      const name = nameOf(projectId);
      linkMutation.mutate(
        { threadId: thread.id, projectId, previousProjectId },
        {
          onSuccess: () => {
            toast.success(`Correo vinculado a ${name}`);
            onClose();
          },
        },
      );
      return;
    }
    taskMutation.mutate(
      { threadId: thread.id, projectId, title: title.trim() || undefined, previousProjectId },
      {
        onSuccess: ({ taskId }) => {
          toast.success("Tarea creada", { action: { label: "Abrir", onClick: () => onOpenTask(taskId) } });
          onClose();
        },
      },
    );
  }

  function unlink() {
    setError(null);
    linkMutation.mutate(
      { threadId: thread.id, projectId: null, previousProjectId: thread.projectId },
      {
        onSuccess: () => {
          toast.success("Vínculo quitado");
          onClose();
        },
      },
    );
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
          <Button variant="outline" size="sm" onClick={unlink} disabled={pending}>
            Quitar vínculo
          </Button>
        ) : null}
        <Button size="sm" onClick={submit} disabled={pending || !projectId || projects === null}>
          {mode === "link" ? "Vincular" : "Crear tarea"}
        </Button>
      </div>
    </div>
  );
}
