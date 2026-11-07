"use client";

import { useMemo, type MouseEvent } from "react";
import { NotebookPen, Plus } from "lucide-react";

import { Button } from "@/components/ui/shadcn/button";
import { EntityCardGrid } from "@/components/widgets/EntityCardGrid";
import { IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { NOTE_COLOR_LABELS, NOTE_COLOR_TINT, noteEditedLabel, sortNotes } from "@/lib/my-space/note-ui";
import type { Note } from "@/lib/types/redesign";
import type { EntityCard, RecordTableData } from "@/lib/types/widgets";

export type NotesGridProps = {
  notes: Note[];
  onOpen(note: Note): void;
  /** "Nueva nota" and the empty-state button; hidden when omitted or while `createNoteAction` is a stub. */
  onNew?(): void;
};

/** Deep link of a note (FE §2.1): the page opens `NoteEditor` from `?nota=<id>`. */
export function noteHref(id: string): string {
  return `/mi-espacio?nota=${encodeURIComponent(id)}`;
}

/** One note → one card of `EntityCardGrid` (title, body, pin icon, tint, "editada …"). */
export function noteToCard(note: Note, now: Date = new Date()): EntityCard {
  return {
    id: note.id,
    title: note.title.trim() || "Sin título",
    subtitle: note.body || undefined,
    href: noteHref(note.id),
    iconName: note.pinned ? "pin" : undefined,
    meta: [{ label: "Editada", value: noteEditedLabel(note.updatedAt, now) }],
    tint: NOTE_COLOR_TINT[note.color],
  };
}

/** Analítico index (FE §3.3): Título, Color, Fijada, Editada. */
export function notesTable(notes: Note[]): RecordTableData {
  return {
    columns: [
      { key: "titulo", label: "Título" },
      { key: "color", label: "Color" },
      { key: "fijada", label: "Fijada" },
      { key: "editada", label: "Editada", format: "date", mono: true },
    ],
    rows: notes.map((n) => ({
      id: n.id,
      href: noteHref(n.id),
      titulo: n.title.trim() || "Sin título",
      color: NOTE_COLOR_LABELS[n.color],
      fijada: n.pinned ? "Sí" : "No",
      editada: n.updatedAt,
    })),
  };
}

/**
 * Notes grid (redesign FE §3.3): an instance of `EntityCardGrid`
 * (`minmax(220px,1fr)`), pinned notes first. The widget renders the three
 * styles (tinted cards / white cards / index table). A click on a note opens it
 * in place through `onOpen`; without JavaScript the card link `?nota=<id>`
 * still opens the editor.
 */
export function NotesGrid({ notes, onOpen, onNew }: NotesGridProps) {
  const sorted = useMemo(() => sortNotes(notes), [notes]);
  const items = useMemo(() => sorted.map((n) => noteToCard(n)), [sorted]);
  const table = useMemo(() => notesTable(sorted), [sorted]);
  const canCreate = IMPLEMENTED.createNoteAction && typeof onNew === "function";

  // Delegated click: the widget renders plain links (keyboard Enter fires a click too).
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const link = (event.target as Element | null)?.closest?.("a[href]");
    if (!link) return;
    const id = new URL(link.getAttribute("href") ?? "", "http://localhost").searchParams.get("nota");
    const note = id ? sorted.find((n) => n.id === id) : undefined;
    if (!note) return;
    event.preventDefault();
    onOpen(note);
  }

  return (
    <div className="flex flex-col gap-3" data-testid="notes-grid">
      {canCreate && sorted.length > 0 ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => onNew?.()}>
            <Plus aria-hidden="true" />
            Nueva nota
          </Button>
        </div>
      ) : null}
      <div onClick={handleClick}>
        <EntityCardGrid
          items={items}
          table={table}
          minWidth={220}
          emptyState={{
            icon: NotebookPen,
            title: "Escribe tu primera nota",
            description: "Tus notas son privadas: solo tú las ves.",
            action: canCreate ? { label: "Nueva nota", onClick: () => onNew?.() } : undefined,
          }}
        />
      </div>
    </div>
  );
}
