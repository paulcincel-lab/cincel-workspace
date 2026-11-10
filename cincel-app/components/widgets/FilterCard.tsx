"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { cn } from "@/lib/utils";

/**
 * Analítico filter card (ADR 0005, frames `Main`, `Analitico-Vencidas`): one
 * square segmented control per group (radiogroup with roving `tabIndex`, one
 * tab stop per group; arrows / Home / End move and select, like
 * `EstiloSwitch`), an `extra` slot, then the search input. URL sync is the
 * caller's job.
 */
export type FilterOption = { value: string; label: string; count?: number; color?: string; tone?: "default" | "destructive" };
export type FilterGroup = { id: string; label: string; options: FilterOption[]; value: string };
export type FilterCardProps = {
  groups: FilterGroup[];
  onChange(groupId: string, value: string): void;
  search?: { value: string; onChange(v: string): void; placeholder: string; label: string };
  extra?: ReactNode;
};

export const FILTERS_LABEL = "Filtros";

function countClass(option: FilterOption, checked: boolean): string {
  if (checked) return "text-primary-foreground";
  return option.tone === "destructive" ? "text-destructive" : "text-muted-foreground";
}

function Segmented({ group, onChange }: { group: FilterGroup; onChange: FilterCardProps["onChange"] }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const options = group.options;
  const checkedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === group.value),
  );

  function select(index: number) {
    const option = options[index];
    if (option && option.value !== group.value) onChange(group.id, option.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        target = (index + 1) % options.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        target = (index - 1 + options.length) % options.length;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = options.length - 1;
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        select(index);
        return;
      default:
        return;
    }
    event.preventDefault();
    refs.current[target]?.focus();
    select(target);
  }

  return (
    <div data-slot="filter-group" data-group={group.id} className="flex flex-wrap items-center gap-2">
      <span aria-hidden="true" className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
        {group.label}
      </span>
      <div role="radiogroup" aria-label={group.label} className="inline-flex flex-wrap items-center gap-0.5 rounded-[8px] border border-border p-0.5">
        {options.map((option, index) => {
          const checked = index === checkedIndex;
          return (
            <Button
              key={option.value}
              ref={(el: HTMLButtonElement | null) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              data-value={option.value}
              tabIndex={checked ? 0 : -1}
              variant={checked ? "default" : "ghost"}
              size="sm"
              onClick={() => select(index)}
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, index)}
            >
              {option.color ? (
                <span
                  aria-hidden="true"
                  data-slot="filter-swatch"
                  className={cn("size-2 shrink-0 rounded-[2px]", checked && "bg-primary-foreground")}
                  style={checked ? undefined : { backgroundColor: option.color }}
                />
              ) : null}
              {option.label}
              {option.count !== undefined ? (
                <span data-slot="filter-count" className={cn("font-mono", countClass(option, checked))}>
                  {option.count}
                </span>
              ) : null}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function FilterCard({ groups, onChange, search, extra }: FilterCardProps): ReactNode {
  return (
    <section
      aria-label={FILTERS_LABEL}
      data-slot="filter-card"
      className="flex flex-wrap items-center gap-4 rounded-md border bg-card px-4 py-3 shadow-[var(--shadow-card)]"
    >
      {groups.map((group) => (
        <Segmented key={group.id} group={group} onChange={onChange} />
      ))}
      {extra}
      <span className="flex-1" />
      {search ? (
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={search.label}
            placeholder={search.placeholder}
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            className="w-[150px] pl-7"
          />
        </div>
      ) : null}
    </section>
  );
}
