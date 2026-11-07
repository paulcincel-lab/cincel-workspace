"use client";

import type { GmailStatus, GmailThreadSummary, NotificationItem } from "@/lib/types/redesign";

export type InboxProps = {
  notifications: { items: NotificationItem[]; nextCursor: string | null; unreadCount: number };
  gmail: { status: GmailStatus; threads: GmailThreadSummary[]; nextCursor: string | null } | null;
  tab: "todo" | "gmail" | "notificaciones" | "menciones";
};

/**
 * Bandeja (redesign FE §3.3): tabs Todo / Gmail / Notificaciones / Menciones.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function Inbox(props: InboxProps) {
  void props;
  return null;
}
