"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Archive, Bold, Check, Italic, Link, List, ListChecks, ListTodo } from "lucide-react";
import { toast } from "sonner";

import { FormSheet } from "@/components/patterns/FormSheet";
import { NewTaskDialog } from "@/components/tareas/NewTaskDialog";
import { Button } from "@/components/ui/shadcn/button";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Switch } from "@/components/ui/shadcn/switch";
import { Textarea } from "@/components/ui/shadcn/textarea";
import {
  archiveNoteAction,
  createNoteAction,
  restoreNoteAction,
  updateNoteAction,
} from "@/lib/actions/my-space-actions";
import { IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { actionErrorText } from "@/lib/errors";
import {
  NOTE_COLOR_LABELS,
  NOTE_COLORS,
  NOTE_SWATCH_STYLE,
  NOTE_UNDO_MS,
  applyMarkdown,
  noteInputError,
  noteToTaskDefaults,
  type MarkdownCommand,
} from "@/lib/my-space/note-ui";
import { NOT_IMPLEMENTED } from "@/lib/stubs";
import type { Note, NoteColor } from "@/lib/types/redesign";

export type NoteEditorProps = {
  note: Note | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSaved(note: Note): void;
  /** The note left the list (archived); the parent removes it and remembers its place. */
  onArchived?(note: Note): void;
  /** "Deshacer" brought the note back; the parent puts it back in place. */
  onRestored?(note: Note): void;
  /** "Convertir en tarea" (opens `NewTaskDialog` prefilled); off until the Tareas dialog ships. */
  canConvertToTask?: boolean;
};

type Draft = { title: string; body: string; color: NoteColor; pinned: boolean };

function draftOf(note: Note | null): Draft {
  return note
    ? { title: note.title, body: note.body, color: note.color, pinned: note.pinned }
    : { title: "", body: "", color: "neutral", pinned: false };
}

const TOOLBAR: { command: MarkdownCommand; label: string; Icon: typeof Bold }[] = [
  { command: "bold", label: "Negrita", Icon: Bold },
  { command: "italic", label: "Cursiva", Icon: Italic },
  { command: "list", label: "Lista", Icon: List },
  { command: "checklist", label: "Checklist", Icon: ListChecks },
  { command: "link", label: "Enlace", Icon: Link },
];

/** Undo of an archive from the toast: restore, put the note back, report errors as a toast. */
async function undoArchive(id: string, onRestored: NoteEditorProps["onRestored"]): Promise<void> {
  try {
    const restored = await restoreNoteAction(id);
    onRestored?.(restored);
  } catch (err) {
    toast(actionErrorText(err));
  }
}

/**
 * Note editor sheet, 560 px (redesign FE §3.3) on `FormSheet`: title, a
 * markdown toolbar over the body, color swatches, pin switch, "Convertir en
 * tarea" and "Archivar" (toast with "Deshacer" for 10 s). Ignores the
 * presentation style.
 */
export function NoteEditor(props: NoteEditorProps) {
  // Remount the form per note, so a different note starts from its own values.
  return <NoteEditorForm key={props.note?.id ?? "nueva"} {...props} />;
}

function NoteEditorForm({
  note,
  open,
  onOpenChange,
  onSaved,
  onArchived,
  onRestored,
  canConvertToTask = false,
}: NoteEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(note));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const colorLabelId = useId();
  const pinnedId = useId();

  const canSave = note ? IMPLEMENTED.updateNoteAction : IMPLEMENTED.createNoteAction;
  const canArchive = Boolean(note) && IMPLEMENTED.archiveNoteAction;

  function reset() {
    setDraft(draftOf(note));
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function update(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    if (error) setError(null);
  }

  async function handleSubmit() {
    const invalid = noteInputError(draft);
    if (invalid) {
      setError(actionErrorText(new Error(invalid)));
      return;
    }
    if (!canSave) {
      setError(actionErrorText(new Error(NOT_IMPLEMENTED)));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const input = { title: draft.title.trim(), body: draft.body, color: draft.color, pinned: draft.pinned };
      const saved = note ? await updateNoteAction(note.id, input) : await createNoteAction(input);
      toast("Nota guardada");
      onSaved(saved);
      if (!note) setDraft(draftOf(null));
      onOpenChange(false);
    } catch (err) {
      setError(actionErrorText(err));
    } finally {
      setPending(false);
    }
  }

  async function handleArchive() {
    if (!note || !canArchive) return;
    setPending(true);
    setError(null);
    try {
      await archiveNoteAction(note.id);
      onArchived?.(note);
      onOpenChange(false);
      const id = note.id;
      toast("Nota archivada", {
        duration: NOTE_UNDO_MS,
        action: IMPLEMENTED.restoreNoteAction
          ? { label: "Deshacer", onClick: () => void undoArchive(id, onRestored) }
          : undefined,
      });
    } catch (err) {
      setError(actionErrorText(err));
    } finally {
      setPending(false);
    }
  }

  function runCommand(command: MarkdownCommand) {
    const el = bodyRef.current;
    const edit = applyMarkdown(
      {
        value: draft.body,
        selectionStart: el?.selectionStart ?? draft.body.length,
        selectionEnd: el?.selectionEnd ?? draft.body.length,
      },
      command,
    );
    update({ body: edit.value });
    requestAnimationFrame(() => {
      const target = bodyRef.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  }

  function handleSwatchKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = NOTE_COLORS[(index + delta + NOTE_COLORS.length) % NOTE_COLORS.length];
    update({ color: next });
    const group = event.currentTarget.parentElement;
    requestAnimationFrame(() => {
      group?.querySelector<HTMLButtonElement>(`[data-color="${next}"]`)?.focus();
    });
  }

  const taskDefaults = noteToTaskDefaults(draft);

  return (
    <>
      <FormSheet
        title={note ? "Editar nota" : "Nueva nota"}
        description="Solo tú la ves."
        open={open}
        onOpenChange={handleOpenChange}
        onSubmit={handleSubmit}
        submitLabel="Guardar"
        pending={pending}
        error={error}
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <FormField className="flex flex-col gap-1.5">
            <Label>Título</Label>
            <Input value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder="Sin título" />
          </FormField>

          <FormField className="flex flex-col gap-1.5">
            <Label>Nota</Label>
            <div role="toolbar" aria-label="Formato" className="flex items-center gap-1">
              {TOOLBAR.map(({ command, label, Icon }) => (
                <Button
                  key={command}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={label}
                  title={label}
                  onClick={() => runCommand(command)}
                >
                  <Icon aria-hidden="true" />
                </Button>
              ))}
            </div>
            <Textarea
              ref={bodyRef}
              rows={10}
              value={draft.body}
              onChange={(e) => update({ body: e.target.value })}
              placeholder="Escribe aquí. Usa markdown: **negrita**, _cursiva_, - lista, - [ ] pendiente."
            />
          </FormField>

          <div className="flex flex-col gap-1.5">
            <span id={colorLabelId} className="text-sm font-medium text-foreground">
              Color
            </span>
            <div role="radiogroup" aria-labelledby={colorLabelId} className="flex items-center gap-2">
              {NOTE_COLORS.map((color, index) => {
                const checked = draft.color === color;
                return (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={NOTE_COLOR_LABELS[color]}
                    data-color={color}
                    tabIndex={checked ? 0 : -1}
                    onClick={() => update({ color })}
                    onKeyDown={(e) => handleSwatchKey(e, index)}
                    style={NOTE_SWATCH_STYLE[color]}
                    className="flex size-8 items-center justify-center rounded-full border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {checked ? <Check aria-hidden="true" className="size-4" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id={pinnedId} checked={draft.pinned} onCheckedChange={(checked) => update({ pinned: checked })} />
            <Label htmlFor={pinnedId}>Fijar nota</Label>
          </div>

          {canConvertToTask || canArchive ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {canConvertToTask ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!taskDefaults.title}
                  onClick={() => setTaskOpen(true)}
                >
                  <ListTodo aria-hidden="true" />
                  Convertir en tarea
                </Button>
              ) : null}
              {canArchive ? (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => void handleArchive()}>
                  <Archive aria-hidden="true" />
                  Archivar
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </FormSheet>
      {canConvertToTask ? (
        <NewTaskDialog
          open={taskOpen}
          onOpenChange={setTaskOpen}
          defaults={{
            title: taskDefaults.title,
            description: taskDefaults.description,
            projectId: note?.projectId ?? undefined,
          }}
        />
      ) : null}
    </>
  );
}
