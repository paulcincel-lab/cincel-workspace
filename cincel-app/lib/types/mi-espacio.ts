/**
 * `/mi-espacio` page data (Query Migration Phase 7, #941). Client-safe types.
 */
import type { TaskListItem } from "@/lib/types/core";
import type {
  Checklist,
  GmailAttachment,
  GmailMessage,
  GmailStatus,
  GmailThreadSummary,
  Note,
  NotificationsPage,
  Reminder,
} from "@/lib/types/redesign";

/** Gmail status and one page of cached threads; null while the Gmail read is a stub. */
export type MiEspacioGmail = { status: GmailStatus; threads: GmailThreadSummary[]; nextCursor: string | null } | null;

/** One page of cached Gmail threads (`fetchGmailThreadsAction`). */
export type GmailThreadsPage = { threads: GmailThreadSummary[]; nextCursor: string | null };

/** One bounded page of notes or checklists; `nextCursor` is null after the last page. */
export type MySpaceListPage<T> = { items: T[]; nextCursor: string | null };

/** The live Gmail thread of the reading pane (`fetchGmailThreadAction`). */
export type GmailThreadView = {
  thread: GmailThreadSummary;
  messages: GmailMessage[];
  attachments: GmailAttachment[];
};

/**
 * `getMiEspacioPageData` → seeds `me.notifications`, `me.gmail.status`,
 * `me.gmail.threads('')`, `me.reminders('today-tomorrow')`, `me.checklists`,
 * `me.notes` and `me.tasks`. Notes and checklists are their first bounded
 * page; the cursors load the next ones.
 */
export type MiEspacioPageData = {
  notifications: NotificationsPage;
  gmail: MiEspacioGmail;
  /** Today and tomorrow. */
  reminders: Reminder[];
  checklists: Checklist[];
  checklistsCursor: string | null;
  notes: Note[];
  notesCursor: string | null;
  /** My open tasks (`fetchMyOpenTasksAction` order). */
  tasks: TaskListItem[];
  /** `canCreateActivity`: the quick add of the task lists. Not a query key; the page passes it down. */
  canCreateTask: boolean;
};
