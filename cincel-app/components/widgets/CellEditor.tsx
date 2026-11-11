"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MutableRefObject, ReactNode, RefObject } from "react";
import { CheckIcon, LockIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/shadcn/avatar";
import { Button } from "@/components/ui/shadcn/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/shadcn/command";
import { Input } from "@/components/ui/shadcn/input";
import { Popover, PopoverContent } from "@/components/ui/shadcn/popover";
import { getPersonInitials } from "@/components/ui/TeamMultiSelect";
import {
  type AnyCellEdit,
  type CellEdit,
  type CellOption,
  type CellValue,
  type PeopleCellEdit,
  CLEAR_LABEL,
  DATE_QUICK_PICKS,
  EMPTY_TITLE_ERROR,
  NO_RESULTS,
  PEOPLE_HINT,
  quickPickDate,
  sameCellValue,
  SEARCH_ARIA_LABEL,
  SEARCH_MIN_OPTIONS,
  SEARCH_PLACEHOLDER,
} from "@/components/widgets/editable-cell";

/**
 * The popover editor of one cell (#1023), anchored to the cell, built on the
 * shadcn Popover + Command primitives. One component for the five kinds
 * (select, person, people, date, text); a locked cell shows only its reason.
 * The people multi-select (#1038) keeps its picks as a draft: Enter, Tab or
 * closing the editor (Esc, a click outside) saves them.
 *
 * The editor doesn't save by itself: it reports the chosen value through
 * `onCommitted` (only when it differs from `edit.value(row)`) and closes;
 * the caller saves it (`useCellCommit`).
 */
export type CellEditorProps<Row> = {
  /** The cell element the popover is anchored to; focus returns to it on close. */
  anchor: HTMLElement | null;
  edit: AnyCellEdit<Row>;
  row: Row;
  /** `canEdit(row)` result: true, or the lock reason shown instead of the editor. */
  canEdit: true | string;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Called with the chosen value after a save (Enter, a pick, Tab; a people cell also on close). */
  onCommitted?(value: CellValue): void;
  /** Tab inside the editor: saved; the table moves to the next editable cell in the row. */
  onTabNext?(): void;
  /** Letter typed on the cell that opened a list editor; seeds its search. */
  initialQuery?: string;
  /** Field name for the search placeholder and the toast ("Responsable"). */
  label?: string;
};

/** What every kind's body gets: the chosen value goes through `finish`. */
type BodyProps<Row> = {
  row: Row;
  label?: string;
  focusRef: RefObject<HTMLElement | null>;
  /** Saves `value` (when it changed) and closes; `next` moves on to the next cell. */
  finish(value: CellValue, next: boolean): void;
  close(): void;
};

export function CellEditor<Row>(props: CellEditorProps<Row>): ReactNode {
  const { anchor, edit, row, canEdit, open, onOpenChange, onCommitted, onTabNext, initialQuery, label } = props;
  const focusRef = useRef<HTMLElement | null>(null);
  // People: the picks not saved yet (null until one changes); closing saves them.
  const draftRef = useRef<string[] | null>(null);

  const saveDraft = () => {
    const draft = draftRef.current;
    draftRef.current = null;
    if (draft === null || canEdit !== true || edit.kind !== "people") return;
    if (!sameCellValue(draft, edit.value(row))) onCommitted?.(draft);
  };
  const latestSave = useRef(saveDraft);
  useEffect(() => {
    latestSave.current = saveDraft;
  });
  // Closed from outside (the cell toggled it): the picks still save.
  useEffect(() => {
    if (!open) latestSave.current();
  }, [open]);

  const close = () => {
    saveDraft();
    onOpenChange(false);
  };
  const finish = (value: CellValue, next: boolean) => {
    draftRef.current = null;
    if (!sameCellValue(value, edit.value(row))) onCommitted?.(value);
    onOpenChange(false);
    if (next) onTabNext?.();
  };

  const body: BodyProps<Row> = { row, label, focusRef, finish, close };
  const anchorWidth = anchor?.offsetWidth ?? 0;
  const minWidth =
    edit.kind === "text"
      ? Math.max(260, anchorWidth)
      : edit.kind === "date"
        ? 280
        : edit.kind === "people"
          ? Math.max(240, anchorWidth)
          : Math.max(220, anchorWidth);

  return (
    <Popover open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <PopoverContent
        anchor={anchor}
        side="bottom"
        align="start"
        initialFocus={focusRef}
        finalFocus={() => anchor ?? true}
        aria-label={label}
        className="max-w-[calc(100vw-2rem)] p-0"
        style={{ minWidth: `min(${minWidth}px, calc(100vw - 2rem))` }}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
      >
        {canEdit !== true ? (
          <LockedBody reason={canEdit} focusRef={focusRef} />
        ) : edit.kind === "people" ? (
          <PeopleBody {...body} edit={edit} draftRef={draftRef} initialQuery={initialQuery} />
        ) : edit.kind === "select" || edit.kind === "person" ? (
          <ListBody {...body} edit={edit} initialQuery={initialQuery} />
        ) : edit.kind === "date" ? (
          <DateBody {...body} edit={edit} />
        ) : (
          <TextBody {...body} edit={edit} />
        )}
      </PopoverContent>
    </Popover>
  );
}

function LockedBody({ reason, focusRef }: { reason: string; focusRef: RefObject<HTMLElement | null> }) {
  return (
    <div
      ref={(el) => {
        focusRef.current = el;
      }}
      tabIndex={-1}
      className="flex max-w-72 items-start gap-2 p-3 text-sm text-muted-foreground outline-none"
    >
      <LockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{reason}</p>
    </div>
  );
}

function Hint({ left, right }: { left: string; right: string }) {
  return (
    <div aria-hidden="true" className="flex justify-between gap-3 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

type Entry = { id: string; option: CellOption };

/** The select / person list, the current value checked. */
function ListBody<Row>({
  edit,
  row,
  label,
  focusRef,
  finish,
  initialQuery,
}: BodyProps<Row> & { edit: Extract<CellEdit<Row>, { kind: "select" | "person" }>; initialQuery?: string }) {
  const current = edit.value(row);
  const entries = useMemo<Entry[]>(() => {
    const options = [...edit.options(row)];
    if (edit.clearable && !options.some((o) => o.value === null)) {
      const clear: CellOption = {
        value: null,
        label: edit.kind === "person" ? CLEAR_LABEL.person : label ? `Sin ${label.toLowerCase()}` : "Sin valor",
      };
      if (edit.kind === "person") options.unshift(clear);
      else options.push(clear);
    }
    return options.map((option, i) => ({ id: `opt-${i}`, option }));
  }, [edit, row, label]);

  const searchable =
    edit.kind === "person" || Boolean(initialQuery) || (edit.searchable ?? entries.length > SEARCH_MIN_OPTIONS);
  const [query, setQuery] = useState(initialQuery ?? "");
  const shown = useMemo(() => {
    const term = fold(query.trim());
    return term ? entries.filter((e) => fold(e.option.label).includes(term)) : entries;
  }, [entries, query]);

  const [highlighted, setHighlighted] = useState(() => {
    if (initialQuery) return shown[0]?.id ?? "";
    return (entries.find((e) => e.option.value === current) ?? entries[0])?.id ?? "";
  });

  const pick = (id: string, next: boolean) => {
    const entry = shown.find((e) => e.id === id);
    if (entry) finish(entry.option.value, next);
    else if (next) finish(current, true);
  };

  const setFocus = (el: HTMLElement | null) => {
    focusRef.current = el;
  };

  return (
    <Command
      shouldFilter={false}
      loop={false}
      value={highlighted}
      onValueChange={setHighlighted}
      label={label}
      ref={searchable ? undefined : setFocus}
      tabIndex={searchable ? undefined : -1}
      className="rounded-lg! outline-none"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Tab") return;
        event.preventDefault();
        pick(highlighted, true);
      }}
    >
      {searchable ? (
        <CommandInput
          ref={setFocus}
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            const term = fold(next.trim());
            const first = term ? entries.find((e) => fold(e.option.label).includes(term)) : entries[0];
            setHighlighted(first?.id ?? "");
          }}
          placeholder={SEARCH_PLACEHOLDER(label ?? "opción")}
          aria-label={SEARCH_ARIA_LABEL}
        />
      ) : null}
      <CommandList>
        <CommandEmpty className="py-3">{NO_RESULTS}</CommandEmpty>
        <CommandGroup>
          {shown.map(({ id, option }) => (
            <CommandItem key={id} value={id} data-checked={option.value === current} onSelect={() => pick(id, false)}>
              <OptionMark option={option} />
              <span className="truncate">{option.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      <Hint left="↑↓ elegir · Enter guardar" right="Esc cerrar" />
    </Command>
  );
}

/**
 * The people multi-select (#1038): a search box over the options, each with
 * a checkbox and its avatar; the excluded ones (the row's Responsable) show
 * why and can't be picked. Space or a click toggles; Enter and Tab save.
 */
function PeopleBody<Row>({
  edit,
  row,
  label,
  focusRef,
  finish,
  draftRef,
  initialQuery,
}: BodyProps<Row> & {
  edit: PeopleCellEdit<Row>;
  draftRef: MutableRefObject<string[] | null>;
  initialQuery?: string;
}) {
  const [initial] = useState(() => edit.value(row));
  const [picked, setPicked] = useState<string[]>(initial);
  const excluded = useMemo(() => new Set(edit.exclude?.(row) ?? []), [edit, row]);
  // Picked people first (as the editor opened, so rows don't jump while toggling), then the rest.
  const entries = useMemo<Entry[]>(() => {
    const was = new Set(initial);
    const options = edit.options(row).filter((o): o is CellOption & { value: string } => o.value !== null);
    const ordered = [...options.filter((o) => was.has(o.value)), ...options.filter((o) => !was.has(o.value))];
    return ordered.map((option) => ({ id: `p:${option.value}`, option }));
  }, [edit, row, initial]);

  const [query, setQuery] = useState(initialQuery ?? "");
  const shown = useMemo(() => {
    const term = fold(query.trim());
    return term ? entries.filter((e) => fold(e.option.label).includes(term)) : entries;
  }, [entries, query]);
  const firstPickable = (list: Entry[]) => list.find((e) => !excluded.has(e.option.value ?? ""))?.id ?? "";
  const [highlighted, setHighlighted] = useState(() => firstPickable(shown));

  const toggle = (id: string) => {
    const value = entries.find((e) => e.id === id)?.option.value;
    if (!value || excluded.has(value)) return;
    const next = picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value];
    setPicked(next);
    draftRef.current = next;
  };

  return (
    <Command
      shouldFilter={false}
      loop={false}
      value={highlighted}
      onValueChange={setHighlighted}
      label={label}
      className="rounded-lg! outline-none"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          finish(picked, event.key === "Tab");
        } else if (event.key === " ") {
          event.preventDefault();
          toggle(highlighted);
        }
      }}
    >
      <CommandInput
        ref={(el) => {
          focusRef.current = el;
        }}
        value={query}
        onValueChange={(next) => {
          setQuery(next);
          const term = fold(next.trim());
          setHighlighted(firstPickable(term ? entries.filter((e) => fold(e.option.label).includes(term)) : entries));
        }}
        placeholder={SEARCH_PLACEHOLDER(label ?? "persona")}
        aria-label={SEARCH_ARIA_LABEL}
      />
      <CommandList aria-multiselectable="true">
        <CommandEmpty className="py-3">{NO_RESULTS}</CommandEmpty>
        <CommandGroup>
          {shown.map(({ id, option }) => {
            const value = option.value ?? "";
            const off = excluded.has(value);
            const checked = picked.includes(value);
            return (
              <CommandItem
                key={id}
                value={id}
                disabled={off}
                aria-checked={checked}
                data-slot="people-option"
                onSelect={() => toggle(id)}
              >
                <span
                  aria-hidden="true"
                  data-checked={checked || undefined}
                  className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground"
                >
                  {checked ? <CheckIcon className="size-3" /> : null}
                </span>
                <OptionMark option={option} />
                <span className="truncate">{option.label}</span>
                {off && edit.excludedLabel ? (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{edit.excludedLabel}</span>
                ) : null}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
      <Hint left={PEOPLE_HINT.left} right={PEOPLE_HINT.right} />
    </Command>
  );
}

function OptionMark({ option }: { option: CellOption }) {
  if (option.avatar) {
    return (
      <Avatar className="size-5">
        {option.avatar.photoUrl ? <AvatarImage src={option.avatar.photoUrl} alt="" /> : null}
        <AvatarFallback className="bg-foreground text-[9px] font-bold text-background">
          {getPersonInitials(option.avatar.name)}
        </AvatarFallback>
      </Avatar>
    );
  }
  if (option.color) {
    return <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: option.color }} />;
  }
  return null;
}

/** Quick picks plus the calendar (native date field). */
function DateBody<Row>({ edit, row, label, focusRef, finish }: BodyProps<Row> & { edit: Extract<CellEdit<Row>, { kind: "date" }> }) {
  const current = edit.value(row);
  const [draft, setDraft] = useState(current ?? "");
  // Typing digits fires `change` on every keystroke; only a pick from the calendar saves right away.
  const typed = useRef(false);
  const picks = DATE_QUICK_PICKS.filter((p) => (p.id === "none" ? edit.clearable : edit.quickPicks !== false));

  const save = (next: boolean) => {
    if (!draft && !edit.clearable) {
      finish(current, next);
      return;
    }
    finish(draft || null, next);
  };

  return (
    <div
      className="flex flex-col"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" && event.key !== "Tab") return;
        if (event.key === "Enter" && event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        save(event.key === "Tab");
      }}
    >
      {picks.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 p-2">
          {picks.map((p) => (
            <Button key={p.id} type="button" variant="outline" size="sm" onClick={() => finish(quickPickDate(p.id), false)}>
              {p.label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="px-2 pb-2">
        <Input
          ref={(el) => {
            focusRef.current = el;
          }}
          type="date"
          aria-label={label ?? "Fecha"}
          value={draft}
          onKeyDown={(event) => {
            if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete") typed.current = true;
          }}
          onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            if (value && !typed.current) finish(value, false);
          }}
        />
      </div>
      <Hint left="Enter guardar" right="Esc cerrar" />
    </div>
  );
}

/** A field over the cell; `required` blocks an empty value. */
function TextBody<Row>({ edit, row, label, focusRef, finish }: BodyProps<Row> & { edit: Extract<CellEdit<Row>, { kind: "text" }> }) {
  const current = edit.value(row);
  const [draft, setDraft] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  return (
    <div className="flex flex-col">
      <div className="p-2">
        <Input
          ref={(el) => {
            focusRef.current = el;
          }}
          onFocus={(event) => event.currentTarget.select()}
          type="text"
          aria-label={label ?? "Texto"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== "Tab") return;
            event.preventDefault();
            const value = draft.trim();
            if (!value && edit.required) {
              setError(EMPTY_TITLE_ERROR);
              return;
            }
            finish(value || null, event.key === "Tab");
          }}
        />
        {error ? (
          <p id={errorId} role="alert" className="mt-1.5 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Hint left="Enter guardar" right="Esc cancelar" />
    </div>
  );
}
