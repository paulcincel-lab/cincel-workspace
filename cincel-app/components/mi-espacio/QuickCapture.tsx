"use client";

import { Plus } from "lucide-react";
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
  createChecklistAction,
  createNoteAction,
  parseReminderTextAction,
} from "@/lib/actions/my-space-actions";
import { IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { actionErrorText } from "@/lib/errors";
import { useActionMutation } from "@/lib/query/mutation";
import { insertCachedChecklist, upsertCachedNote } from "@/lib/query/options/mi-espacio";
import type { Checklist, Note, ParsedReminder } from "@/lib/types/redesign";

import { ReminderDialog } from "./ReminderDialog";
import { NEW_NOTE, NOTE_PARAM, replaceMiEspacioParam } from "./search-params";

export const QUICK_CAPTURE_PLACEHOLDER =
  "Escribe una nota, “recuérdame mañana 9am llamar a Juanma” o “- [ ] checklist”";

/** `parseReminderTextAction` accepts up to 280 characters (BE §8.4). */
const REMINDER_TEXT_MAX = 280;

const CHECKLIST_MARKER = /^-\s*\[\s?\]/;
const CHECKLIST_SPLIT = /-\s*\[\s?\]/;

/** True when the text starts with "- [ ]" (the checklist shortcut). */
export function isChecklistText(text: string): boolean {
  return CHECKLIST_MARKER.test(text.trim());
}

/**
 * "- [ ] Visita de obra - [ ] planos - [ ] fotos" → title "Visita de obra",
 * items ["planos", "fotos"]. Text without the marker becomes the title.
 * Null when nothing is left after the markers.
 */
export function parseChecklistText(text: string): { title: string; items: string[] } | null {
  const parts = text
    .trim()
    .split(CHECKLIST_SPLIT)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const [title, ...items] = parts;
  return { title, items };
}

type ReminderState = { open: boolean; text?: string; parsed?: ParsedReminder };

/**
 * Quick capture (redesign FE §3.3): Enter routes "- [ ] …" to a checklist,
 * text with a parsed `dueAt` to `ReminderDialog` (prefilled) and anything
 * else to a note. A kind and its button exist only while its actions are
 * implemented (FE §9 stubs rule); with none implemented nothing renders.
 * A created note or checklist goes straight into `me.notes` / `me.checklists`
 * (no refetch, no route re-render). Forms ignore the presentation style.
 */
export function QuickCapture() {
  const inputId = useId();
  const errorId = useId();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminder, setReminder] = useState<ReminderState>({ open: false });

  // Errors reach the inline alert through `run` (mutateAsync rejects), so no toast here.
  const createNote = useActionMutation<{ body: string }, Note>(createNoteAction, {
    setData: (qc, note) => upsertCachedNote(qc, note),
    onFormError: () => undefined,
  });
  const createChecklist = useActionMutation<{ title: string; items?: string[] }, Checklist>(createChecklistAction, {
    setData: (qc, checklist) => insertCachedChecklist(qc, checklist),
    onFormError: () => undefined,
  });

  const canNote = IMPLEMENTED.createNoteAction;
  const canChecklist = IMPLEMENTED.createChecklistAction;
  const canReminder = IMPLEMENTED.parseReminderTextAction && IMPLEMENTED.createReminderAction;

  if (!canNote && !canChecklist && !canReminder) return null;

  function done() {
    setText("");
    setError(null);
  }

  async function run(task: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(actionErrorText(err));
    } finally {
      setPending(false);
    }
  }

  async function saveNote(value: string) {
    await createNote.mutateAsync({ body: value });
    toast.success("Nota guardada");
    done();
  }

  async function saveChecklist(value: string) {
    const parsed = parseChecklistText(value);
    if (!parsed) return;
    await createChecklist.mutateAsync(parsed.items.length > 0 ? parsed : { title: parsed.title });
    toast.success("Checklist creado");
    done();
  }

  /** The parse of the text, or null when it is too long to be a reminder. */
  async function parse(value: string): Promise<ParsedReminder | null> {
    if (value.length > REMINDER_TEXT_MAX) return null;
    return parseReminderTextAction(value);
  }

  function openReminder(value: string, parsed?: ParsedReminder) {
    setReminder({ open: true, text: value || undefined, parsed });
  }

  /** Enter: checklist marker → checklist; parsed date → reminder dialog; else note. */
  async function submit() {
    const value = text.trim();
    if (!value || pending) return;
    await run(async () => {
      if (canChecklist && isChecklistText(value)) {
        await saveChecklist(value);
        return;
      }
      if (canReminder) {
        const parsed = await parse(value);
        if (parsed?.dueAt) {
          openReminder(value, parsed);
          return;
        }
      }
      if (canNote) await saveNote(value);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  /** "Nota": saves the text as a note; with an empty input opens the editor. */
  function onNote() {
    const value = text.trim();
    if (!value) {
      replaceMiEspacioParam(NOTE_PARAM, NEW_NOTE);
      return;
    }
    void run(() => saveNote(value));
  }

  function onChecklist() {
    const value = text.trim();
    if (!value) return;
    void run(() => saveChecklist(value));
  }

  /** "Recordatorio": opens the dialog, prefilled with the parse of the text. */
  function onReminder() {
    const value = text.trim();
    if (!value) {
      openReminder("");
      return;
    }
    void run(async () => {
      const parsed = await parse(value);
      openReminder(value, parsed ?? undefined);
    });
  }

  return (
    <Card className="px-3 py-2">
      <form className="flex flex-wrap items-center gap-2" onSubmit={onSubmit} aria-busy={pending}>
        <Plus aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <Label htmlFor={inputId} className="sr-only">
          Captura rápida
        </Label>
        <Input
          id={inputId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={QUICK_CAPTURE_PLACEHOLDER}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-w-0 flex-1 basis-48"
        />
        <div className="hidden gap-1 md:flex">
          {canNote ? (
            <Button type="button" variant="outline" size="sm" onClick={onNote} disabled={pending}>
              Nota
            </Button>
          ) : null}
          {canChecklist ? (
            <Button type="button" variant="outline" size="sm" onClick={onChecklist} disabled={pending}>
              Checklist
            </Button>
          ) : null}
          {canReminder ? (
            <Button type="button" variant="outline" size="sm" onClick={onReminder} disabled={pending}>
              Recordatorio
            </Button>
          ) : null}
        </div>
        <Button
          type="submit"
          variant="secondary"
          size="icon"
          className="size-11 md:hidden"
          aria-label="Capturar"
          disabled={pending}
        >
          <Plus aria-hidden="true" />
        </Button>
        {error ? (
          <p id={errorId} role="alert" className="w-full text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>
      {canReminder ? (
        <ReminderDialog
          open={reminder.open}
          initialText={reminder.text}
          parsed={reminder.parsed}
          onOpenChange={(open) => setReminder((current) => (open ? { ...current, open } : { open: false }))}
          onCreated={() => {
            setReminder({ open: false });
            done();
          }}
        />
      ) : null}
    </Card>
  );
}
