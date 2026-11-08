import { redirect } from "next/navigation";

import { MiEspacioClient, type MiEspacioClientProps } from "@/components/mi-espacio/MiEspacioClient";
import { fetchGmailStatusAction, fetchGmailThreadsAction } from "@/lib/actions/gmail-actions";
import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { fetchChecklistsAction, fetchNotesAction, fetchRemindersAction } from "@/lib/actions/my-space-actions";
import { fetchNotificationsAction } from "@/lib/actions/notifications-actions";
import { getSessionAccess } from "@/lib/auth/session";
import { todayTomorrowRange } from "@/lib/my-space/today-tomorrow";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? raw : null;
}

/** Gmail status + first page of threads (only when connected with the read scope). */
async function loadGmail(): Promise<MiEspacioClientProps["gmail"]> {
  if (!GMAIL_IMPLEMENTED.fetchGmailStatusAction) return null;
  const status = await fetchGmailStatusAction();
  if (!status.connected || !status.scopeOk || !GMAIL_IMPLEMENTED.fetchGmailThreadsAction) {
    return { status, threads: [], nextCursor: null };
  }
  try {
    const { threads, nextCursor } = await fetchGmailThreadsAction({});
    return { status, threads, nextCursor };
  } catch {
    // NOT_CONNECTED / SCOPE_MISSING between the two reads: the Bandeja shows the status chip.
    return { status, threads: [], nextCursor: null };
  }
}

/**
 * /mi-espacio (redesign FE §3.3): the private home of each staff member.
 * Every read is owner-scoped on the server (the session decides whose rows load);
 * read stubs return empty data and the client hides their sections.
 */
export default async function MiEspacioPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const access = await getSessionAccess();
  if (!access.user) redirect("/login");

  const [notifications, gmail, reminders, checklists, notes] = await Promise.all([
    fetchNotificationsAction({}),
    loadGmail(),
    fetchRemindersAction(todayTomorrowRange(new Date())),
    fetchChecklistsAction(),
    fetchNotesAction(),
  ]);

  return (
    <MiEspacioClient
      notifications={notifications}
      gmail={gmail}
      reminders={reminders}
      checklists={checklists}
      notes={notes}
      noteParam={first(params.nota)}
    />
  );
}
