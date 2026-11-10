"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Bell, Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { IMPLEMENTED as NOTIFICATIONS_IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import { actionErrorText } from "@/lib/errors";
import { sortNotes } from "@/lib/my-space/note-ui";
import { formatReminderWhen, remindersForTodayAndTomorrow } from "@/lib/my-space/reminder-time";
import {
  flattenPages,
  meChecklistsOptions,
  meNotesOptions,
  meRemindersOptions,
} from "@/lib/query/options/mi-espacio";

import { ChecklistCard } from "./ChecklistCard";
import { GmailReader } from "./GmailReader";
import { Inbox } from "./Inbox";
import { NoteEditor } from "./NoteEditor";
import { NotesGrid } from "./NotesGrid";
import { QuickCapture } from "./QuickCapture";
import { NEW_NOTE, NOTE_PARAM, THREAD_PARAM, replaceMiEspacioParam } from "./search-params";

export type MiEspacioClientProps = {
  /** `?nota=<id>` (or "nueva") on the first render; afterwards the URL is read. */
  noteParam: string | null;
};

export const MI_ESPACIO_TITLE = "Mi espacio";
export const MI_ESPACIO_DESCRIPTION = "Tu bandeja, notas, checklists y recordatorios.";
export const MI_ESPACIO_PRIVATE_CHIP = "Solo tú lo ves";

/**
 * /mi-espacio client (redesign FE §3.3, §5): header, quick capture, the
 * Bandeja (left), Recordatorios and Checklists (right), the notes grid below,
 * and the editors opened by `?nota=` / `?correo=`. Every list reads its query
 * (`me.*`, seeded by the page); mutations patch those queries, so nothing
 * here keeps a copy of server data. Every section exists only while its read
 * action is implemented (FE §9 stubs rule). The three presentation styles
 * are rendered by the widgets inside each section; this component never
 * branches on the style.
 */
export function MiEspacioClient(props: MiEspacioClientProps) {
  const searchParams = useSearchParams();
  const notesHeadingId = useId();
  const remindersHeadingId = useId();
  const checklistsHeadingId = useId();

  const notesQuery = useInfiniteQuery({ ...meNotesOptions(), enabled: IMPLEMENTED.fetchNotesAction });
  const checklistsQuery = useInfiniteQuery({ ...meChecklistsOptions(), enabled: IMPLEMENTED.fetchChecklistsAction });
  const remindersQuery = useQuery({ ...meRemindersOptions(), enabled: IMPLEMENTED.fetchRemindersAction });

  const notes = useMemo(() => sortNotes(flattenPages(notesQuery.data?.pages)), [notesQuery.data]);
  const checklists = useMemo(() => flattenPages(checklistsQuery.data?.pages), [checklistsQuery.data]);
  const reminders = remindersQuery.data ?? [];

  const showInbox = NOTIFICATIONS_IMPLEMENTED.fetchNotificationsAction || GMAIL_IMPLEMENTED.fetchGmailStatusAction;
  const showReminders = IMPLEMENTED.fetchRemindersAction;
  const showChecklists = IMPLEMENTED.fetchChecklistsAction;
  const showNotes = IMPLEMENTED.fetchNotesAction;

  const threadId = GMAIL_IMPLEMENTED.fetchGmailThreadAction ? (searchParams?.get(THREAD_PARAM) ?? null) : null;

  // `?nota=<id>` | `?nota=nueva` → NoteEditor; an id that is not one of my live notes → NOT_FOUND copy.
  const noteParam = showNotes ? (searchParams ? searchParams.get(NOTE_PARAM) : props.noteParam) : null;
  const isNewNote = noteParam === NEW_NOTE && IMPLEMENTED.createNoteAction;
  const editingNote = noteParam && noteParam !== NEW_NOTE ? (notes.find((n) => n.id === noteParam) ?? null) : null;
  // A deep link to an older note: load the next pages until it shows up or the list ends.
  const seekingNote =
    noteParam !== null && noteParam !== NEW_NOTE && editingNote === null && (notesQuery.hasNextPage ?? false);
  const { fetchNextPage: fetchMoreNotes, isFetchingNextPage: fetchingMoreNotes } = notesQuery;
  useEffect(() => {
    if (seekingNote && !fetchingMoreNotes) void fetchMoreNotes();
  }, [seekingNote, fetchingMoreNotes, fetchMoreNotes]);
  const noteNotFound =
    noteParam !== null && noteParam !== NEW_NOTE && editingNote === null && !seekingNote && !notesQuery.isPending;
  const editorOpen = isNewNote || (editingNote !== null && IMPLEMENTED.updateNoteAction);

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
      />

      <QuickCapture />

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
            <Inbox />
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
                    checklists.map((checklist) => <ChecklistCard key={checklist.id} checklist={checklist} />)
                  )}
                  {checklistsQuery.hasNextPage ? (
                    <MoreButton
                      pending={checklistsQuery.isFetchingNextPage}
                      onClick={() => void checklistsQuery.fetchNextPage()}
                    />
                  ) : null}
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
          {notesQuery.hasNextPage ? (
            <MoreButton pending={notesQuery.isFetchingNextPage} onClick={() => void notesQuery.fetchNextPage()} />
          ) : null}
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
            if (isNewNote) replaceMiEspacioParam(NOTE_PARAM, note.id);
          }}
          onArchived={closeNote}
        />
      ) : null}
    </div>
  );
}

/** "Ver más": the next bounded page of notes or checklists. */
function MoreButton({ pending, onClick }: { pending: boolean; onClick(): void }) {
  return (
    <div className="flex justify-center">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClick}>
        {pending ? "Cargando…" : "Ver más"}
      </Button>
    </div>
  );
}
