"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/patterns/FormDialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/shadcn/command";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { createReminderAction, parseReminderTextAction } from "@/lib/actions/my-space-actions";
import { IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { searchWorkspaceAction } from "@/lib/actions/search-actions";
import { IMPLEMENTED as SEARCH_IMPLEMENTED } from "@/lib/actions/search-actions.flags";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import {
  REMINDER_CHANNEL_LABELS,
  REMINDER_REPEAT_LABELS,
  formatReminderWhen,
  isPastReminderTime,
  toZonedInputs,
  zonedInputsToIso,
} from "@/lib/my-space/reminder-time";
import type { ParsedReminder, Reminder, ReminderChannel, ReminderRepeat, SearchResult } from "@/lib/types/redesign";

export type ReminderDialogProps = {
  open: boolean;
  initialText?: string;
  parsed?: ParsedReminder;
  onOpenChange(open: boolean): void;
  onCreated(r: Reminder): void;
};

type LinkTarget = { type: "tarea" | "proyecto"; id: string; title: string };

type FormState = {
  text: string;
  date: string;
  time: string;
  repeat: ReminderRepeat;
  channels: ReminderChannel[];
  link: LinkTarget | null;
  /** The user edited date / time or Repetir: later parses no longer overwrite them. */
  whenTouched: boolean;
  repeatTouched: boolean;
  /** Latest parse, for the text it was computed from. */
  parse: { forText: string; result: ParsedReminder } | null;
};

const REPEAT_ORDER: ReminderRepeat[] = ["none", "daily", "weekly", "monthly"];
const CHANNEL_ORDER: ReminderChannel[] = ["app", "email"];
const DEBOUNCE_MS = 300;
const DEFAULT_TIME = "09:00";
const EMPTY_PARSE: ParsedReminder = { cleanText: "", dueAt: null, repeat: "none" };

function initialForm(initialText: string | undefined, parsed: ParsedReminder | undefined): FormState {
  const text = initialText ?? parsed?.cleanText ?? "";
  const when = parsed?.dueAt ? toZonedInputs(parsed.dueAt) : null;
  return {
    text,
    date: when?.date ?? "",
    time: when?.time ?? DEFAULT_TIME,
    repeat: parsed?.repeat ?? "none",
    channels: ["app"],
    link: null,
    whenTouched: false,
    repeatTouched: false,
    parse: parsed ? { forText: text, result: parsed } : null,
  };
}

/**
 * New reminder dialog (redesign FE §3.3, frame `NuevoRecordatorio`) on
 * `FormDialog`: text with the parsed preview chip, date + time, Repetir, link
 * to a task or project, Avisar por. Forms ignore the presentation style.
 */
export function ReminderDialog({ open, initialText, parsed, onOpenChange, onCreated }: ReminderDialogProps) {
  const ids = useId();
  const [form, setForm] = useState<FormState>(() => initialForm(initialText, parsed));
  const [wasOpen, setWasOpen] = useState(open);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whenError, setWhenError] = useState<string | null>(null);

  // Reset the form each time the dialog opens (prefilled from QuickCapture).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(initialForm(initialText, parsed));
      setError(null);
      setWhenError(null);
      setPending(false);
    }
  }

  // Parse the text as the user types (debounced; stale answers are dropped).
  const parseSeq = useRef(0);
  const text = form.text;
  const alreadyParsed = form.parse?.forText === text;
  useEffect(() => {
    if (!open || !IMPLEMENTED.parseReminderTextAction || alreadyParsed) return;
    const seq = ++parseSeq.current;
    const timer = setTimeout(() => {
      const trimmed = text.trim();
      const run: Promise<ParsedReminder> = trimmed ? parseReminderTextAction(trimmed) : Promise.resolve(EMPTY_PARSE);
      run
        .then((result) => {
          if (seq !== parseSeq.current) return;
          setForm((f) => {
            if (f.text !== text) return f;
            const when = result.dueAt ? toZonedInputs(result.dueAt) : null;
            return {
              ...f,
              parse: { forText: text, result },
              date: !f.whenTouched && when ? when.date : f.date,
              time: !f.whenTouched && when ? when.time : f.time,
              repeat: !f.repeatTouched && result.dueAt ? result.repeat : f.repeat,
            };
          });
        })
        .catch(() => {
          if (seq !== parseSeq.current) return;
          setForm((f) => (f.text === text ? { ...f, parse: { forText: text, result: { ...EMPTY_PARSE, cleanText: text } } } : f));
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, text, alreadyParsed]);

  const currentParse = form.parse && form.parse.forText === form.text ? form.parse.result : null;
  const chip = currentParse?.dueAt ? formatReminderWhen(currentParse.dueAt, new Date()) : null;
  const dateRequired = chip === null;

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const toggleChannel = (channel: ReminderChannel, checked: boolean) =>
    setForm((f) => ({
      ...f,
      channels: CHANNEL_ORDER.filter((c) => (c === channel ? checked : f.channels.includes(c))),
    }));

  async function submit() {
    setError(null);
    setWhenError(null);
    const raw = form.text.trim();
    const cleanText = currentParse?.cleanText.trim() ? currentParse.cleanText.trim() : raw;
    const dueAt = form.date ? zonedInputsToIso(form.date, form.time || DEFAULT_TIME) : null;
    if (!raw || !dueAt || form.channels.length === 0) {
      setError(actionErrorText("INVALID"));
      return;
    }
    if (isPastReminderTime(dueAt, new Date())) {
      setWhenError(actionErrorText("PAST_TIME"));
      return;
    }
    setPending(true);
    try {
      const reminder = await createReminderAction({
        text: cleanText,
        dueAt,
        repeat: form.repeat,
        channels: form.channels,
        ...(form.link?.type === "tarea" ? { taskId: form.link.id } : {}),
        ...(form.link?.type === "proyecto" ? { projectId: form.link.id } : {}),
      });
      toast.success(`Recordatorio creado para ${formatReminderWhen(reminder.dueAt, new Date())}`);
      onCreated(reminder);
      onOpenChange(false);
    } catch (err) {
      if (actionErrorCode(err) === "PAST_TIME") setWhenError(actionErrorText(err));
      else setError(actionErrorText(err));
    } finally {
      setPending(false);
    }
  }

  const whenErrorId = `${ids}-when-error`;

  return (
    <FormDialog
      title="Nuevo recordatorio"
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      submitLabel="Crear recordatorio"
      pending={pending}
      error={error}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${ids}-text`}>Recordatorio</Label>
          <Input
            id={`${ids}-text`}
            value={form.text}
            maxLength={280}
            required
            placeholder="Llamar a Juanma mañana 9am"
            aria-describedby={`${ids}-chip`}
            onChange={(e) => update({ text: e.target.value })}
          />
          <div id={`${ids}-chip`} aria-live="polite" className="min-h-5">
            {chip ? (
              <Badge variant="secondary" data-testid="reminder-parsed-chip">
                {chip}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor={`${ids}-date`}>Fecha</Label>
            <Input
              id={`${ids}-date`}
              type="date"
              value={form.date}
              required={dateRequired}
              aria-required={dateRequired}
              aria-invalid={whenError ? true : undefined}
              aria-describedby={whenError ? whenErrorId : undefined}
              onChange={(e) => update({ date: e.target.value, whenTouched: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${ids}-time`}>Hora</Label>
            <Input
              id={`${ids}-time`}
              type="time"
              value={form.time}
              aria-invalid={whenError ? true : undefined}
              aria-describedby={whenError ? whenErrorId : undefined}
              onChange={(e) => update({ time: e.target.value, whenTouched: true })}
            />
          </div>
        </div>
        {whenError ? (
          <p id={whenErrorId} role="alert" className="text-sm text-destructive">
            {whenError}
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={`${ids}-repeat`}>Repetir</Label>
          <Select
            items={REMINDER_REPEAT_LABELS}
            value={form.repeat}
            onValueChange={(v) => {
              if (typeof v === "string") update({ repeat: v as ReminderRepeat, repeatTouched: true });
            }}
          >
            <SelectTrigger id={`${ids}-repeat`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPEAT_ORDER.map((r) => (
                <SelectItem key={r} value={r}>
                  {REMINDER_REPEAT_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {SEARCH_IMPLEMENTED.searchWorkspaceAction ? (
          <LinkPicker labelId={`${ids}-link-label`} value={form.link} onChange={(link) => update({ link })} />
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Avisar por</legend>
          <div className="flex flex-wrap gap-4">
            {CHANNEL_ORDER.map((channel) => (
              <label key={channel} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={form.channels.includes(channel)}
                  onCheckedChange={(checked) => toggleChannel(channel, checked === true)}
                />
                {REMINDER_CHANNEL_LABELS[channel]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </FormDialog>
  );
}

/** "Vincular a tarea o proyecto" combobox over `searchWorkspaceAction`. */
function LinkPicker({
  labelId,
  value,
  onChange,
}: {
  labelId: string;
  value: LinkTarget | null;
  onChange(link: LinkTarget | null): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const current = ++seq.current;
    const timer = setTimeout(() => {
      if (q.length < 2) {
        if (current === seq.current) setResults([]);
        return;
      }
      searchWorkspaceAction({ query: q, types: ["tarea", "proyecto"], limit: 8 })
        .then((found) => {
          if (current === seq.current) setResults(found.filter((r) => r.type === "tarea" || r.type === "proyecto"));
        })
        .catch(() => {
          if (current === seq.current) setResults([]);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-2">
      <Label id={labelId}>Vincular a tarea o proyecto</Label>
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={<Button type="button" variant="outline" className="flex-1 justify-between" aria-labelledby={labelId} />}
          >
            <span className="truncate">{value ? value.title : "Sin vincular"}</span>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Buscar tarea o proyecto..." value={query} onValueChange={setQuery} />
              <CommandList>
                <CommandEmpty>Sin resultados.</CommandEmpty>
                <CommandGroup>
                  {results.map((r) => (
                    <CommandItem
                      key={`${r.type}:${r.id}`}
                      value={`${r.type}:${r.id}`}
                      onSelect={() => {
                        onChange({ type: r.type === "tarea" ? "tarea" : "proyecto", id: r.id, title: r.title });
                        setOpen(false);
                      }}
                    >
                      <span className="truncate">{r.title}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {r.type === "tarea" ? "Tarea" : "Proyecto"}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {value ? (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            Quitar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
