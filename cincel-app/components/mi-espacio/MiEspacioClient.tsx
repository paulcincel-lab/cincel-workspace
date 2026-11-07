"use client";

import type { Checklist, Note, NotificationsPage, Reminder } from "@/lib/types/redesign";

import type { InboxProps } from "./Inbox";

export type MiEspacioClientProps = {
  notifications: NotificationsPage;
  gmail: InboxProps["gmail"];
  /** Today and tomorrow. */
  reminders: Reminder[];
  checklists: Checklist[];
  notes: Note[];
  /** `?nota=<id>` (or "nueva") opens `NoteEditor`. */
  noteParam: string | null;
};

/**
 * /mi-espacio client (redesign FE §3.3, §5): tab, selected thread, editors and
 * optimistic lists over the data the page loads.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function MiEspacioClient(props: MiEspacioClientProps) {
  void props;
  return null;
}
