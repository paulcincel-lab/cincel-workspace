"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { CheckIcon, ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/shadcn/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/shadcn/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { cn } from "@/lib/utils";

/**
 * The Tareas Proyecto filter (#1045): a button that opens a searchable
 * multi-select (`Command`: the search box is the combobox, the options a
 * multi-selectable listbox), with each project's open and overdue tasks.
 * "Todos" clears the selection. The picked projects show as chips, each
 * with its own remove button. URL sync is the caller's job; every style
 * passes its own trigger look (`triggerClassName`).
 */
export type ProjectFilterOption = { id: string; name: string; open?: number; overdue?: number };

export type ProjectFilterProps = {
  options: readonly ProjectFilterOption[];
  selected: readonly string[];
  onChange(ids: string[]): void;
  /** Shows the mono "PROYECTO" label before the button (Analítico, like Responsable). */
  showLabel?: boolean;
  triggerClassName?: string;
  chipClassName?: string;
};

export const PROJECT_FILTER_LABEL = "Proyecto";
export const PROJECT_FILTER_ALL = "Todos";
export const PROJECT_FILTER_SEARCH = "Buscar proyecto";
export const PROJECT_FILTER_EMPTY = "Sin resultados";

const ALL_VALUE = "__todos";

/** Case- and accent-insensitive text, for the search. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** The options by name (es), the ones `term` matches. Pure. */
export function projectFilterOptions(options: readonly ProjectFilterOption[], term: string): ProjectFilterOption[] {
  const needle = fold(term.trim());
  return [...options]
    .filter((o) => !needle || fold(o.name).includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** The button text: "Todos", the project's name, or "3 proyectos". Pure. */
export function projectFilterSummary(options: readonly ProjectFilterOption[], selected: readonly string[]): string {
  if (selected.length === 0) return PROJECT_FILTER_ALL;
  if (selected.length === 1) return options.find((o) => o.id === selected[0])?.name ?? "1 proyecto";
  return `${selected.length} proyectos`;
}

/** "12 abiertas · 3 en retraso" for screen readers and the option's counts. Pure. */
export function projectFilterCounts(option: ProjectFilterOption): string | null {
  if (option.open === undefined) return null;
  const open = `${option.open} ${option.open === 1 ? "abierta" : "abiertas"}`;
  return option.overdue ? `${open} · ${option.overdue} en retraso` : open;
}

export function ProjectFilter({
  options,
  selected,
  onChange,
  showLabel = false,
  triggerClassName,
  chipClassName,
}: ProjectFilterProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => projectFilterOptions(options, query), [options, query]);
  const picked = useMemo(() => new Set(selected), [selected]);
  const [highlighted, setHighlighted] = useState("");
  const summary = projectFilterSummary(options, selected);
  const chips = useMemo(
    () => selected.flatMap((id) => options.find((o) => o.id === id) ?? []).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [options, selected],
  );

  const toggle = (id: string) => {
    if (id === ALL_VALUE) {
      onChange([]);
      return;
    }
    onChange(picked.has(id) ? selected.filter((v) => v !== id) : [...selected, id]);
  };

  return (
    <div data-slot="filter-group" data-group="proyecto" className="flex flex-wrap items-center gap-2">
      {showLabel ? (
        <span aria-hidden="true" className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
          {PROJECT_FILTER_LABEL}
        </span>
      ) : null}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant={selected.length > 0 ? "secondary" : "outline"}
              size="sm"
              aria-label={`${PROJECT_FILTER_LABEL}: ${summary}`}
              data-slot="project-filter-trigger"
              className={cn("max-w-56 gap-1.5", triggerClassName)}
            />
          }
        >
          {showLabel ? null : <span className="text-muted-foreground">{PROJECT_FILTER_LABEL}:</span>}
          <span className="truncate">{summary}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" aria-label={PROJECT_FILTER_LABEL}>
          <Command
            shouldFilter={false}
            loop
            value={highlighted}
            onValueChange={setHighlighted}
            label={PROJECT_FILTER_LABEL}
            onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
              // Space toggles the highlighted project, like Enter, without closing.
              if (event.key === " " && highlighted && (event.target as HTMLElement).tagName !== "INPUT") {
                event.preventDefault();
                toggle(highlighted);
              }
            }}
          >
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={PROJECT_FILTER_SEARCH}
              aria-label={PROJECT_FILTER_SEARCH}
            />
            <CommandList aria-multiselectable="true" aria-label={PROJECT_FILTER_LABEL}>
              <CommandEmpty className="py-3">{PROJECT_FILTER_EMPTY}</CommandEmpty>
              <CommandGroup>
                {query.trim() === "" ? (
                  <CommandItem value={ALL_VALUE} aria-checked={selected.length === 0} onSelect={() => toggle(ALL_VALUE)}>
                    <CheckMark checked={selected.length === 0} />
                    <span>{PROJECT_FILTER_ALL}</span>
                  </CommandItem>
                ) : null}
                {shown.map((option) => {
                  const checked = picked.has(option.id);
                  const counts = projectFilterCounts(option);
                  return (
                    <CommandItem
                      key={option.id}
                      value={option.id}
                      aria-checked={checked}
                      data-slot="project-option"
                      onSelect={() => toggle(option.id)}
                    >
                      <CheckMark checked={checked} />
                      <span className="min-w-0 flex-1 truncate">{option.name}</span>
                      {counts ? <span className="sr-only">{`, ${counts}`}</span> : null}
                      {option.open !== undefined ? (
                        <span aria-hidden="true" className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-xs">
                          <span className="text-muted-foreground">{option.open}</span>
                          {option.overdue ? <span className="text-destructive">{option.overdue}</span> : null}
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {chips.map((chip) => (
        <Button
          key={chip.id}
          type="button"
          variant="outline"
          size="sm"
          data-slot="project-filter-chip"
          aria-label={`Quitar ${chip.name}`}
          className={cn("h-7 max-w-48 gap-1 rounded-full px-2.5 text-xs", chipClassName)}
          onClick={() => onChange(selected.filter((id) => id !== chip.id))}
        >
          <span className="truncate">{chip.name}</span>
          <X aria-hidden="true" className="size-3 shrink-0" />
        </Button>
      ))}
    </div>
  );
}

function CheckMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-checked={checked || undefined}
      className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground"
    >
      {checked ? <CheckIcon className="size-3" /> : null}
    </span>
  );
}
