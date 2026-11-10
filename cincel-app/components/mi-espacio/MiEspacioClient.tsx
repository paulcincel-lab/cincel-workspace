"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import { Alert, AlertAction, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { MiEspacioEsencial } from "@/components/widgets/MiEspacioEsencial";
import { MiEspacioAnalitico } from "@/components/widgets/MiEspacioAnalitico";
import { MiEspacioBoard } from "@/components/widgets/MiEspacioBoard";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { actionErrorText } from "@/lib/errors";
import { sortNotes } from "@/lib/my-space/note-ui";
import { flattenPages, meNotesOptions } from "@/lib/query/options/mi-espacio";

import { GmailReader } from "./GmailReader";
import { NoteEditor } from "./NoteEditor";
import { NEW_NOTE, NOTE_PARAM, THREAD_PARAM, replaceMiEspacioParam } from "./search-params";

export type MiEspacioClientProps = {
  /** `?nota=<id>` (or "nueva") on the first render; afterwards the URL is read. */
  noteParam: string | null;
  /** `canCreateActivity` (page data): the task quick add. Default false. */
  canCreateTask?: boolean;
};

export const MI_ESPACIO_TITLE = "Mi espacio";
export const MI_ESPACIO_DESCRIPTION = "Tu bandeja, notas, checklists y recordatorios.";
export const MI_ESPACIO_PRIVATE_CHIP = "Solo tú lo ves";

/**
 * /mi-espacio client (redesign FE §3.3, §5; ADR 0004): one layout per style
 * through `PageStyleLayout` (Visual `MiEspacioBoard`, Esencial
 * `MiEspacioEsencial`, Analítico `MiEspacioAnalitico`), plus what every
 * style shares: the `?nota=` not-found notice, the `?correo=` Gmail reader
 * and the note editor. Every list reads its query (`me.*`, seeded by the
 * page); mutations patch those queries, so nothing here keeps a copy of
 * server data. This component never branches on the style.
 */
export function MiEspacioClient(props: MiEspacioClientProps) {
  const searchParams = useSearchParams();

  const notesQuery = useInfiniteQuery({ ...meNotesOptions(), enabled: IMPLEMENTED.fetchNotesAction });

  const notes = useMemo(() => sortNotes(flattenPages(notesQuery.data?.pages)), [notesQuery.data]);

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

  // Shared by every style: the ?nota= not-found notice, the ?correo= reader and the note editor.
  const notice = noteNotFound ? (
    <Alert variant="destructive">
      <AlertDescription>{actionErrorText("NOT_FOUND")}</AlertDescription>
      <AlertAction>
        <Button type="button" variant="outline" size="sm" onClick={closeNote}>
          Cerrar
        </Button>
      </AlertAction>
    </Alert>
  ) : null;
  const reader = threadId ? (
    <GmailReader threadId={threadId} onClose={() => replaceMiEspacioParam(THREAD_PARAM, null)} />
  ) : null;
  const editor = showNotes ? (
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
  ) : null;

  return (
    <>
      <PageStyleLayout
        visual={() => <MiEspacioBoard notice={notice} reader={reader} canCreateTask={props.canCreateTask ?? false} />}
        esencial={() => <MiEspacioEsencial notice={notice} reader={reader} />}
        analitico={() => <MiEspacioAnalitico notice={notice} reader={reader} />}
      />
      {editor}
    </>
  );
}
