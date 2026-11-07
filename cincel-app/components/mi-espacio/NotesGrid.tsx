"use client";

import type { Note } from "@/lib/types/redesign";

export type NotesGridProps = { notes: Note[]; onOpen(note: Note): void };

/**
 * Notes grid (redesign FE §3.3): an instance of `EntityCardGrid`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function NotesGrid(props: NotesGridProps) {
  void props;
  return null;
}
