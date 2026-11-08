"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Archive, Bold, Check, Italic, Link, List, ListChecks, ListTodo } from "lucide-react";
import { toast } from "sonner";

import { FormSheet } from "@/components/patterns/FormSheet";
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
import { useActionMutation } from "@/lib/query/mutation";
import {
  patchCachedNote,
  removeCachedNote,
  restoreSnapshot,
  snapshotNotes,
  upsertCachedNote,
  type NotesData,
  type Snapshot,
} from "@/lib/query/options/mi-espacio";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { NOT_IMPLEMENTED } from "@/lib/stubs";
import type { Note, NoteColor } from "@/lib/types/redesign";

/**
 * The editor writes `me.notes` itself (optimistic edit and archive, the saved
 * note on create and restore); the callbacks only move the URL.
 */
export type NoteEditorProps = {
  note: Note | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSaved(note: Note): void;
  /** The note left the list (archived). */
  onArchived?(note: Note): void;
  /** "Convertir en tarea": opens the shared new-task dialog (`useNewTaskUi`) prefilled from the note. */
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

type NoteInput = { title: string; body: string; color: NoteColor; pinned: boolean };

/**
 * Note editor sheet, 560 px (redesign FE §3.3) on `FormSheet`: title, a
 * markdown toolbar over the body, color swatches, pin switch, "Convertir en
 * tarea" and "Archivar" (toast with "Deshacer" for 10 s). Edits and archive
 * patch `me.notes` at once and roll back on error. Ignores the presentation
 * style.
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
  canConvertToTask = false,
}: NoteEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(note));
  const [error, setError] = useState<string | null>(null);
  const openNewTask = useNewTaskUi((s) => s.openNewTask);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const colorLabelId = useId();
  const pinnedId = useId();

  const canSave = note ? IMPLEMENTED.updateNoteAction : IMPLEMENTED.createNoteAction;
  const canArchive = Boolean(note) && IMPLEMENTED.archiveNoteAction;

  const createMutation = useActionMutation<NoteInput, Note>(createNoteAction, {
    setData: (qc, saved) => upsertCachedNote(qc, saved),
    onFormError: setError,
  });
  const updateMutation = useActionMutation<{ id: string; input: NoteInput }, Note, Snapshot<NotesData>>(
    ({ id, input }) => updateNoteAction(id, input),
    {
      optimistic: {
        async onMutate(qc, { id, input }) {
          const snap = await snapshotNotes(qc);
          patchCachedNote(qc, id, input);
          return snap;
        },
        rollback: restoreSnapshot,
      },
      setData: (qc, saved) => upsertCachedNote(qc, saved),
      onFormError: setError,
    },
  );
  const restoreMutation = useActionMutation<string, Note>(restoreNoteAction, {
    setData: (qc, restored) => upsertCachedNote(qc, restored),
  });
  const archiveMutation = useActionMutation<string, void, Snapshot<NotesData>>(archiveNoteAction, {
    optimistic: {
      async onMutate(qc, id) {
        const snap = await snapshotNotes(qc);
        removeCachedNote(qc, id);
        return snap;
      },
      rollback: restoreSnapshot,
    },
    onFormError: setError,
  });
  const pending = createMutation.isPending || updateMutation.isPending || archiveMutation.isPending;

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
    setError(null);
    const input: NoteInput = { title: draft.title.trim(), body: draft.body, color: draft.color, pinned: draft.pinned };
    let saved: Note;
    try {
      saved = note ? await updateMutation.mutateAsync({ id: note.id, input }) : await createMutation.mutateAsync(input);
    } catch {
      // The mutation already put the error copy in the sheet (`onFormError`) and rolled the edit back.
      return;
    }
    toast("Nota guardada");
    onSaved(saved);
    if (!note) setDraft(draftOf(null));
    onOpenChange(false);
  }

  function handleArchive() {
    if (!note || !canArchive) return;
    setError(null);
    const archived = note;
    archiveMutation.mutate(archived.id, {
      onSuccess: () => {
        onArchived?.(archived);
        onOpenChange(false);
        toast("Nota archivada", {
          duration: NOTE_UNDO_MS,
          action: IMPLEMENTED.restoreNoteAction
            ? { label: "Deshacer", onClick: () => restoreMutation.mutate(archived.id) }
            : undefined,
        });
      },
    });
  }

  function handleConvert() {
    const defaults = noteToTaskDefaults(draft);
    openNewTask(
      { title: defaults.title, description: defaults.description, projectId: note?.projectId ?? undefined },
      "nota",
    );
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
                  onClick={handleConvert}
                >
                  <ListTodo aria-hidden="true" />
                  Convertir en tarea
                </Button>
              ) : null}
              {canArchive ? (
                <Button type="button" variant="ghost" disabled={pending} onClick={handleArchive}>
                  <Archive aria-hidden="true" />
                  Archivar
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </FormSheet>
    </>
  );
}
