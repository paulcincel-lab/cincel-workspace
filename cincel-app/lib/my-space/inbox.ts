/**
 * Bandeja model (redesign FE §3.3, §4.4): the tabs, the merged rows of
 * notifications and Gmail threads, their counts and the es-MX time labels.
 * Pure and client-safe, so the page (RSC) and `Inbox` share the tab parsing.
 */
import type { GmailThreadSummary, NotificationItem, NotificationKind } from "@/lib/types/redesign";

export type InboxTab = "todo" | "gmail" | "notificaciones" | "menciones";

/** Search param that selects the Bandeja tab on `/mi-espacio` (absent = "todo"). */
export const INBOX_TAB_PARAM = "bandeja";

export const INBOX_TABS: { key: InboxTab; label: string }[] = [
  { key: "todo", label: "Todo" },
  { key: "gmail", label: "Gmail" },
  { key: "notificaciones", label: "Notificaciones" },
  { key: "menciones", label: "Menciones" },
];

/** The tab named by `?bandeja=`; anything else is "todo". */
export function parseInboxTab(value: string | string[] | null | undefined): InboxTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return INBOX_TABS.some((t) => t.key === raw) ? (raw as InboxTab) : "todo";
}

/** Query string for a tab, keeping the other params (e.g. `?estilo=`, `?nota=`). */
export function inboxTabSearch(current: string, tab: InboxTab): string {
  const params = new URLSearchParams(current);
  if (tab === "todo") params.delete(INBOX_TAB_PARAM);
  else params.set(INBOX_TAB_PARAM, tab);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export type InboxRow =
  | { key: string; source: "notification"; at: string; unread: boolean; item: NotificationItem }
  | { key: string; source: "gmail"; at: string; unread: boolean; thread: GmailThreadSummary };

export function notificationRow(item: NotificationItem): InboxRow {
  return { key: `n:${item.id}`, source: "notification", at: item.createdAt, unread: item.readAt === null, item };
}

export function gmailRow(thread: GmailThreadSummary): InboxRow {
  return { key: `g:${thread.id}`, source: "gmail", at: thread.receivedAt, unread: thread.unread, thread };
}

function byNewest(a: InboxRow, b: InboxRow): number {
  return Date.parse(b.at) - Date.parse(a.at);
}

/** Rows of one tab, newest first. "Menciones" lists only `mencion` notifications. */
export function inboxRows(
  tab: InboxTab,
  notifications: NotificationItem[],
  threads: GmailThreadSummary[],
): InboxRow[] {
  const n = notifications.map(notificationRow);
  const g = threads.map(gmailRow);
  switch (tab) {
    case "gmail":
      return g.sort(byNewest);
    case "notificaciones":
      return n.sort(byNewest);
    case "menciones":
      return n.filter((r) => r.source === "notification" && r.item.kind === "mencion").sort(byNewest);
    default:
      return [...n, ...g].sort(byNewest);
  }
}

/**
 * Unread counts per tab. Notificaciones uses the server's `unreadCount` (it
 * covers rows past the first page); Menciones and Gmail count the loaded rows.
 */
export function inboxCounts(input: {
  notifications: NotificationItem[];
  unreadCount: number;
  threads: GmailThreadSummary[];
}): Record<InboxTab, number> {
  const menciones = input.notifications.filter((n) => n.kind === "mencion" && n.readAt === null).length;
  const gmail = input.threads.filter((t) => t.unread).length;
  return {
    todo: input.unreadCount + gmail,
    gmail,
    notificaciones: input.unreadCount,
    menciones,
  };
}

/** Merge a polled page (unread rows) into the loaded list: new rows are added, known rows updated; newest first. */
export function mergeNotifications(current: NotificationItem[], incoming: NotificationItem[]): NotificationItem[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Append a further page, skipping rows already loaded. */
export function appendUnique<T extends { id: string }>(current: T[], more: T[]): T[] {
  const seen = new Set(current.map((x) => x.id));
  return [...current, ...more.filter((x) => !seen.has(x.id))];
}

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  asignacion: "Asignación",
  mencion: "Mención",
  vencimiento: "Vencimiento",
  comentario: "Comentario",
  aprobacion_cliente: "Aprobación del cliente",
  recordatorio: "Recordatorio",
  sistema: "Sistema",
};

/** "Origen" of a row (Analítico column and the source chip). */
export function rowOrigin(row: InboxRow): string {
  if (row.source === "gmail") return "Gmail";
  return row.item.kind === "mencion" ? "Mención" : "Notificación";
}

/** Sender / source line: the Gmail sender, or the notification kind. */
export function rowSender(row: InboxRow): string {
  if (row.source === "gmail") return gmailSenderName(row.thread.from);
  return NOTIFICATION_KIND_LABEL[row.item.kind];
}

/** "Ana Pérez <ana@x.mx>" → "Ana Pérez"; a bare address stays as is. */
export function gmailSenderName(from: string): string {
  const match = /^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/.exec(from);
  return match ? match[1].trim() : from.trim();
}

export function rowSubject(row: InboxRow): string {
  if (row.source === "gmail") return row.thread.subject || "(sin asunto)";
  return row.item.title;
}

export function rowSnippet(row: InboxRow): string {
  return row.source === "gmail" ? row.thread.snippet : row.item.body;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const TIME_PARTS_FMT = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", hourCycle: "h23" });
/** "9:02": 24 h, hour without a leading zero (built from parts; some ICU versions pad the hour). */
const TIME_FMT = {
  format(date: Date): string {
    const parts = TIME_PARTS_FMT.formatToParts(date);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    return `${hour}:${minute}`;
  },
};
const DAY_FMT = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

/** "6 nov" (lowercase, no period). */
export function formatShortDay(date: Date): string {
  const parts = DAY_FMT.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((p) => p.type === type)?.value ?? "").replace(/\./g, "").trim().toLowerCase();
  return `${part("day")} ${part("month")}`;
}

/** Row time: "9:02" today, "ayer", otherwise "6 nov". */
export function formatInboxTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (sameDay(date, now)) return TIME_FMT.format(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "ayer";
  return formatShortDay(date);
}

/** Analítico "Recibido": "6 nov 9:02". */
export function formatInboxDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatShortDay(date)} ${TIME_FMT.format(date)}`;
}

/** Gmail chip: "Gmail conectado · sincronizado hace {n} min" (FE §3.3). */
export function gmailSyncLabel(lastSyncedAt: string | null, now: Date = new Date()): string {
  if (!lastSyncedAt) return "Gmail conectado";
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(lastSyncedAt)) / 60_000));
  if (minutes < 60) return `Gmail conectado · sincronizado hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `Gmail conectado · sincronizado hace ${hours} h`;
}
