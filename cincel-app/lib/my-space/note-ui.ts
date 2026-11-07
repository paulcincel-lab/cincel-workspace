/**
 * Client helpers for Mi espacio notes (redesign FE §3.3, §14.5): ordering,
 * the "editada …" meta, color labels and tints, the client-side `INVALID`
 * check that mirrors `createNoteAction` / `updateNoteAction`, and the markdown
 * toolbar edits of `NoteEditor`. Pure and client-safe.
 */
import type { Note, NoteColor } from "@/lib/types/redesign";
import type { EntityCardTint } from "@/lib/types/widgets";

/** Same limit as the server (BE §7.5): a longer body is `INVALID`. */
export const NOTE_BODY_MAX = 20_000;

/** Undo window of the "Nota archivada" toast (FE §9). */
export const NOTE_UNDO_MS = 10_000;

/** Swatch order of the editor (FE §3.3). */
export const NOTE_COLORS: readonly NoteColor[] = ["neutral", "blue", "amber", "violet", "cyan"];

export const NOTE_COLOR_LABELS: Record<NoteColor, string> = {
  neutral: "Neutral",
  blue: "Azul",
  amber: "Ámbar",
  violet: "Violeta",
  cyan: "Cian",
};

/** Note color → card tint token (FE §14.5; same mapping as `NOTE_COLOR_TOKEN`). */
export const NOTE_COLOR_TINT: Record<NoteColor, EntityCardTint> = {
  neutral: "muted",
  blue: "chart-1",
  violet: "chart-2",
  amber: "chart-3",
  cyan: "chart-4",
};

/**
 * Editor swatch colors, from tokens only: the solid series color (or `muted`)
 * with a check mark that meets the non-text pair (`chart-N` / `card` ≥ 3:1).
 */
export const NOTE_SWATCH_STYLE: Record<NoteColor, { backgroundColor: string; color: string }> = {
  neutral: { backgroundColor: "var(--muted)", color: "var(--foreground)" },
  blue: { backgroundColor: "var(--chart-1)", color: "var(--card)" },
  violet: { backgroundColor: "var(--chart-2)", color: "var(--card)" },
  amber: { backgroundColor: "var(--chart-3)", color: "var(--card)" },
  cyan: { backgroundColor: "var(--chart-4)", color: "var(--card)" },
};

/** Pinned first, then `updatedAt` desc (same order as `fetchNotesAction`). */
export function sortNotes(notes: readonly Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** Insert or replace a note, keeping the list order rules. */
export function upsertNote(notes: readonly Note[], note: Note): Note[] {
  return sortNotes([...notes.filter((n) => n.id !== note.id), note]);
}

/** Remove a note; returns the list and the index it had (for an in-place undo). */
export function removeNote(notes: readonly Note[], id: string): { notes: Note[]; index: number } {
  const index = notes.findIndex((n) => n.id === id);
  return { notes: notes.filter((n) => n.id !== id), index };
}

/** Put a restored note back at `index` (the place it had before archiving). */
export function restoreNoteAt(notes: readonly Note[], note: Note, index: number): Note[] {
  const rest = notes.filter((n) => n.id !== note.id);
  const at = index < 0 || index > rest.length ? rest.length : index;
  return [...rest.slice(0, at), note, ...rest.slice(at)];
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "editada hoy" / "editada ayer" / "editada 3 nov" (es-MX, lowercase). */
export function noteEditedLabel(updatedAt: string, now: Date = new Date()): string {
  const at = new Date(updatedAt);
  if (Number.isNaN(at.getTime())) return "editada";
  if (localDayKey(at) === localDayKey(now)) return "editada hoy";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (localDayKey(at) === localDayKey(yesterday)) return "editada ayer";
  const sameYear = at.getFullYear() === now.getFullYear();
  const text = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })
    .format(at)
    .replace(/\./g, "")
    .toLowerCase();
  return `editada ${text}`;
}

/** Client copy of the server rule: `INVALID` when title and body are both empty or the body is too long. */
export function noteInputError(input: { title: string; body: string }): "INVALID" | null {
  if (!input.title.trim() && !input.body.trim()) return "INVALID";
  if (input.body.length > NOTE_BODY_MAX) return "INVALID";
  return null;
}

// ── Markdown toolbar ────────────────────────────────────────────────────────

export type MarkdownCommand = "bold" | "italic" | "list" | "checklist" | "link";

export type TextEdit = { value: string; selectionStart: number; selectionEnd: number };

function wrap(edit: TextEdit, before: string, after: string, placeholder: string): TextEdit {
  const { value, selectionStart: s, selectionEnd: e } = edit;
  const selected = value.slice(s, e) || placeholder;
  const next = value.slice(0, s) + before + selected + after + value.slice(e);
  return { value: next, selectionStart: s + before.length, selectionEnd: s + before.length + selected.length };
}

function prefixLines(edit: TextEdit, prefix: string): TextEdit {
  const { value, selectionStart: s, selectionEnd: e } = edit;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  const nextBreak = value.indexOf("\n", e);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const changed = lines.map((line) => (line.startsWith(prefix) ? line : prefix + line)).join("\n");
  const next = value.slice(0, lineStart) + changed + value.slice(lineEnd);
  const end = lineStart + changed.length;
  return { value: next, selectionStart: end, selectionEnd: end };
}

/** Apply one toolbar command to the textarea's value and selection. */
export function applyMarkdown(edit: TextEdit, command: MarkdownCommand): TextEdit {
  switch (command) {
    case "bold":
      return wrap(edit, "**", "**", "texto");
    case "italic":
      return wrap(edit, "_", "_", "texto");
    case "list":
      return prefixLines(edit, "- ");
    case "checklist":
      return prefixLines(edit, "- [ ] ");
    case "link": {
      const { value, selectionStart: s, selectionEnd: e } = edit;
      const label = value.slice(s, e) || "enlace";
      const url = "https://";
      const inserted = `[${label}](${url})`;
      const next = value.slice(0, s) + inserted + value.slice(e);
      const urlStart = s + label.length + 3;
      return { value: next, selectionStart: urlStart, selectionEnd: urlStart + url.length };
    }
  }
}

/** Text for "Convertir en tarea": first non-empty line as title, the rest as description. */
export function noteToTaskDefaults(note: { title: string; body: string }): { title: string; description: string } {
  const title = note.title.trim();
  if (title) return { title, description: note.body.trim() };
  const lines = note.body.trim().split("\n");
  const first = (lines[0] ?? "").replace(/^[-*]\s+(\[[ x]\]\s+)?/, "").trim();
  return { title: first, description: lines.slice(1).join("\n").trim() };
}
