"use client";

import { Bell, Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useId, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { PageHeader } from "@/components/shell/PageHeader";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { fetchChecklistsAction, fetchNotesAction, fetchRemindersAction } from "@/lib/actions/my-space-actions";
import { IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { IMPLEMENTED as NOTIFICATIONS_IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import { actionErrorText } from "@/lib/errors";
import { INBOX_TAB_PARAM, parseInboxTab } from "@/lib/my-space/inbox";
import { sortNotes, upsertNote } from "@/lib/my-space/note-ui";
import { formatReminderWhen, remindersForTodayAndTomorrow } from "@/lib/my-space/reminder-time";
import { todayTomorrowRange } from "@/lib/my-space/today-tomorrow";
import type { Checklist, Note, NotificationsPage, Reminder } from "@/lib/types/redesign";

import { ChecklistCard } from "./ChecklistCard";
import { GmailReader } from "./GmailReader";
import { Inbox, type InboxProps } from "./Inbox";
import { NoteEditor } from "./NoteEditor";
import { NotesGrid } from "./NotesGrid";
import { QuickCapture, type QuickCaptureProps } from "./QuickCapture";
import { NEW_NOTE, NOTE_PARAM, THREAD_PARAM, replaceMiEspacioParam } from "./search-params";

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

export const MI_ESPACIO_TITLE = "Mi espacio";
export const MI_ESPACIO_DESCRIPTION = "Tu bandeja, notas, checklists y recordatorios.";
export const MI_ESPACIO_PRIVATE_CHIP = "Solo tú lo ves";

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];
}

/** Local copy of a server list; a new prop (after `router.refresh()`) replaces it. */
function useSyncedList<T>(initial: T[]): [T[], Dispatch<SetStateAction<T[]>>] {
  const [list, setList] = useState(initial);
  const [source, setSource] = useState(initial);
  if (initial !== source) {
    setSource(initial);
    setList(initial);
  }
  return [list, setList];
}

/**
 * /mi-espacio client (redesign FE §3.3, §5): header, quick capture, the
 * Bandeja (left), Recordatorios and Checklists (right), the notes grid below,
 * and the editors opened by `?nota=` / `?correo=`. Every section exists only
 * while its read action is implemented (FE §9 stubs rule). The three
 * presentation styles are rendered by the widgets inside each section; this
 * component never branches on the style.
 */
export function MiEspacioClient(props: MiEspacioClientProps) {
  const searchParams = useSearchParams();
  const notesHeadingId = useId();
  const remindersHeadingId = useId();
  const checklistsHeadingId = useId();

  const [notes, setNotes] = useSyncedList(props.notes);
  const [checklists, setChecklists] = useSyncedList(props.checklists);
  const [reminders, setReminders] = useSyncedList(props.reminders);

  const showInbox = NOTIFICATIONS_IMPLEMENTED.fetchNotificationsAction || GMAIL_IMPLEMENTED.fetchGmailStatusAction;
  const showReminders = IMPLEMENTED.fetchRemindersAction;
  const showChecklists = IMPLEMENTED.fetchChecklistsAction;
  const showNotes = IMPLEMENTED.fetchNotesAction;

  const tab = parseInboxTab(searchParams?.get(INBOX_TAB_PARAM));
  const threadId = GMAIL_IMPLEMENTED.fetchGmailThreadAction ? (searchParams?.get(THREAD_PARAM) ?? null) : null;

  // `?nota=<id>` | `?nota=nueva` → NoteEditor; an id that is not one of my live notes → NOT_FOUND copy.
  const noteParam = showNotes ? (searchParams ? searchParams.get(NOTE_PARAM) : props.noteParam) : null;
  const isNewNote = noteParam === NEW_NOTE && IMPLEMENTED.createNoteAction;
  const editingNote = noteParam && noteParam !== NEW_NOTE ? (notes.find((n) => n.id === noteParam) ?? null) : null;
  const noteNotFound = noteParam !== null && noteParam !== NEW_NOTE && editingNote === null;
  const editorOpen = isNewNote || (editingNote !== null && IMPLEMENTED.updateNoteAction);

  const onCreated: QuickCaptureProps["onCreated"] = async (kind) => {
    try {
      if (kind === "nota" && IMPLEMENTED.fetchNotesAction) setNotes(sortNotes(await fetchNotesAction()));
      if (kind === "checklist" && IMPLEMENTED.fetchChecklistsAction) setChecklists(await fetchChecklistsAction());
      if (kind === "recordatorio" && IMPLEMENTED.fetchRemindersAction) {
        setReminders(await fetchRemindersAction(todayTomorrowRange(new Date())));
      }
    } catch (err) {
      toast.error(actionErrorText(err));
    }
  };

  const closeNote = () => replaceMiEspacioParam(NOTE_PARAM, null);

  const now = new Date();
  const upcoming = remindersForTodayAndTomorrow(reminders, now);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        title={MI_ESPACIO_TITLE}
        description={MI_ESPACIO_DESCRIPTION}
        badge={
          <Badge variant="secondary">
            <Lock aria-hidden="true" />
            {MI_ESPACIO_PRIVATE_CHIP}
          </Badge>
        }
        actions={<EstiloSwitch />}
      />

      <QuickCapture onCreated={onCreated} />

      {noteNotFound ? (
        <Alert variant="destructive">
          <AlertDescription>{actionErrorText("NOT_FOUND")}</AlertDescription>
          <AlertAction>
            <Button type="button" variant="outline" size="sm" onClick={closeNote}>
              Cerrar
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start">
        {showInbox ? (
          <div className="flex min-w-0 flex-col gap-4 md:flex-[999_1_560px]">
            <Inbox notifications={props.notifications} gmail={props.gmail} tab={tab} />
            {threadId ? (
              <GmailReader threadId={threadId} onClose={() => replaceMiEspacioParam(THREAD_PARAM, null)} />
            ) : null}
          </div>
        ) : null}

        {showReminders || showChecklists ? (
          <div className="flex min-w-0 flex-col gap-4 md:flex-[1_1_320px]">
            {showReminders ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2 id={remindersHeadingId}>Recordatorios</h2>
                  </CardTitle>
                  <CardDescription>Hoy y mañana</CardDescription>
                </CardHeader>
                <CardContent>
                  {upcoming.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin recordatorios para hoy y mañana</p>
                  ) : (
                    <ul aria-labelledby={remindersHeadingId} className="flex flex-col gap-1">
                      {upcoming.map((reminder) => (
                        <li key={reminder.id} className="flex min-h-11 items-center gap-3">
                          <Bell aria-hidden="true" className="size-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 text-sm">{reminder.text}</span>
                          <time dateTime={reminder.dueAt} className="font-mono text-xs text-muted-foreground">
                            {formatReminderWhen(reminder.dueAt, now)}
                          </time>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {showChecklists ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2 id={checklistsHeadingId}>Checklists</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {checklists.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aún no tienes checklists.</p>
                  ) : (
                    checklists.map((checklist) => (
                      <ChecklistCard
                        key={checklist.id}
                        checklist={checklist}
                        onChange={(next) => setChecklists((current) => upsert(current, next))}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>

      {showNotes ? (
        <section aria-labelledby={notesHeadingId} className="flex flex-col gap-3">
          <h2 id={notesHeadingId} className="text-base font-semibold">
            Notas
          </h2>
          <NotesGrid
            notes={notes}
            onOpen={(note) => replaceMiEspacioParam(NOTE_PARAM, note.id)}
            onNew={IMPLEMENTED.createNoteAction ? () => replaceMiEspacioParam(NOTE_PARAM, NEW_NOTE) : undefined}
          />
        </section>
      ) : null}

      {showNotes ? (
        <NoteEditor
          note={isNewNote ? null : editingNote}
          open={editorOpen}
          onOpenChange={(open) => {
            if (!open) closeNote();
          }}
          onSaved={(note) => {
            setNotes((current) => upsertNote(current, note));
            if (isNewNote) replaceMiEspacioParam(NOTE_PARAM, note.id);
          }}
          onArchived={(note) => {
            setNotes((current) => current.filter((n) => n.id !== note.id));
            closeNote();
          }}
          onRestored={(note) => setNotes((current) => upsertNote(current, note))}
        />
      ) : null}
    </div>
  );
}
