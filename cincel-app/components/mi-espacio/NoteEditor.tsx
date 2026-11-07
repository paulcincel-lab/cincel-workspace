"use client";

import type { Note } from "@/lib/types/redesign";

export type NoteEditorProps = { note: Note | null; open: boolean; onOpenChange(open: boolean): void; onSaved(note: Note): void };

/**
 * Note editor sheet, 560 px (redesign FE §3.3).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function NoteEditor(props: NoteEditorProps) {
  void props;
  return null;
}
