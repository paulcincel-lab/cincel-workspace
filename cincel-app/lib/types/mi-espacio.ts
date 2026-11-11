/**
 * `/mi-espacio` page data (Query Migration Phase 7, #941). Client-safe types.
 */
import type { MeTasksListFilters, MyTasksSummary, MyTasksSummaryInput } from "@/lib/my-space/my-tasks-summary";
import type { TareasRowsPage } from "@/lib/tareas/page-data";
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
 * `me.notes`, `me.tasksSummary` and `me.tasksList`. Notes and checklists are
 * their first bounded page; the cursors load the next ones.
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
  /** My tasks: the counts and the first page of the lists the style shows first (#1051). */
  tasks: MiEspacioTasksSeed;
  /** `canCreateActivity`: the quick add of the task lists. Not a query key; the page passes it down. */
  canCreateTask: boolean;
};

/**
 * Mi espacio's tasks in the page data (#1051): the summary of `input`
 * (`qk.me.tasksSummary(input)`) and the first page of each list in `lists`
 * (`qk.me.tasksList(filters)`). Never the whole list.
 */
export type MiEspacioTasksSeed = {
  input: MyTasksSummaryInput;
  summary: MyTasksSummary;
  lists: { filters: MeTasksListFilters; page: TareasRowsPage }[];
};
