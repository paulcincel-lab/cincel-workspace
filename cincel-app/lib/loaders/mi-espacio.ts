import "server-only";

import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { db } from "@/lib/db/client";
import { loadGmailAccess } from "@/lib/gmail/access";
import { gmailStatusOf, listGmailThreadsPage } from "@/lib/gmail/threads-page";
import { listChecklistsPage, listNotesPage } from "@/lib/my-space/notes-checklists";
import { listNotificationsPage } from "@/lib/my-space/notifications-page";
import { listReminders } from "@/lib/my-space/reminder-service";
import { todayTomorrowRange } from "@/lib/my-space/today-tomorrow";
import type { MiEspacioGmail, MiEspacioPageData } from "@/lib/types/mi-espacio";

/**
 * Gmail status and the first page of cached threads, with `loadGmailAccess`
 * computed once. Null while the Gmail read is a stub; no threads unless
 * connected with the read scope.
 */
async function loadGmail(staffId: string): Promise<MiEspacioGmail> {
  if (!GMAIL_IMPLEMENTED.fetchGmailStatusAction) return null;
  const access = await loadGmailAccess(db, staffId);
  const status = gmailStatusOf(access);
  if (!status.connected || !status.scopeOk || !GMAIL_IMPLEMENTED.fetchGmailThreadsAction) {
    return { status, threads: [], nextCursor: null };
  }
  try {
    const { threads, nextCursor } = await listGmailThreadsPage(staffId, {});
    return { status, threads, nextCursor };
  } catch {
    // The Bandeja shows the status chip; a load-more retries the read.
    return { status, threads: [], nextCursor: null };
  }
}

/**
 * `/mi-espacio` page data (Query Migration Phase 7, #941): `(user) => data`.
 * `getMiEspacioPageData` calls it after the session check and the page
 * prefetch calls it directly; `seedMiEspacio` writes the result into the
 * granular keys (`me.notifications`, `me.gmail.*`, `me.reminders`,
 * `me.checklists`, `me.notes`).
 *
 * Security (plan §4.8 rule 2): every read is owner-scoped by
 * `user.member.id`, so only the viewer's own rows reach the dehydrated HTML.
 * Notes and checklists are bounded first pages; the Gmail payload is cached
 * summaries only (bodies are read live and sanitized by
 * `fetchGmailThreadAction`). Read-only.
 */
export async function loadMiEspacio(user: AuthenticatedUser, now: Date = new Date()): Promise<MiEspacioPageData> {
  const staffId = user.member.id;
  const [notifications, gmail, reminders, checklists, notes] = await Promise.all([
    listNotificationsPage(staffId, {}),
    loadGmail(staffId),
    listReminders(user, todayTomorrowRange(now), now),
    listChecklistsPage(user),
    listNotesPage(user),
  ]);
  return {
    notifications,
    gmail,
    reminders,
    checklists: checklists.items,
    checklistsCursor: checklists.nextCursor,
    notes: notes.items,
    notesCursor: notes.nextCursor,
  };
}
