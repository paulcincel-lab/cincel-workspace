"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";

/**
 * Filters row (redesign FE §4.11): chips with `aria-pressed` and URL hrefs,
 * selects and search. Extends `TaskMemberProjectFilters`: the same pressed
 * toggle chips and project select, generalized. Chips are links, so the filter
 * state lives in the URL (server-readable, no client-only state); the selects
 * slot takes the page's comboboxes (or `TaskMemberProjectFilters` itself).
 * The bar is not style-aware and renders the same in every presentation style.
 */
export type FiltersBarChip = {
  key: string;
  label: string;
  count?: number;
  /** CSS custom property (e.g. `--chart-2`) for the chip's color square. */
  colorVar?: string;
  pressed: boolean;
  href: string;
};

export type FiltersBarProps = {
  chips?: FiltersBarChip[];
  selects?: ReactNode[];
  search?: { value: string; placeholder: string; onChange(v: string): void };
};

/** `--x` → `var(--x)`; an already wrapped `var(--x)` passes through. */
export function colorVarValue(colorVar: string): string {
  const v = colorVar.trim();
  return v.startsWith("--") ? `var(${v})` : v;
}

function FilterChip({ chip }: { chip: FiltersBarChip }) {
  const swatch: CSSProperties | undefined = chip.colorVar ? { background: colorVarValue(chip.colorVar) } : undefined;
  return (
    <Button
      variant={chip.pressed ? "default" : "outline"}
      size="sm"
      nativeButton={false}
      aria-pressed={chip.pressed}
      data-state={chip.pressed ? "on" : "off"}
      render={<Link href={chip.href} replace scroll={false} />}
    >
      {swatch ? <span aria-hidden="true" data-slot="chip-swatch" className="size-2.5 rounded-sm" style={swatch} /> : null}
      <span>{chip.label}</span>
      {chip.count !== undefined ? (
        <span data-slot="chip-count" className="tabular-nums">
          {chip.count}
        </span>
      ) : null}
    </Button>
  );
}

export function FiltersBar({ chips, selects, search }: FiltersBarProps) {
  const chipList = chips ?? [];
  const selectList = selects ?? [];
  if (chipList.length === 0 && selectList.length === 0 && !search) return null;

  return (
    <div data-slot="filters-bar" className="flex flex-wrap items-center gap-2">
      {chipList.length > 0 ? (
        <div role="group" aria-label="Filtros" className="flex flex-wrap items-center gap-1.5">
          {chipList.map((chip) => (
            <FilterChip key={chip.key} chip={chip} />
          ))}
        </div>
      ) : null}
      {selectList.map((select, i) => (
        <div key={i} data-slot="filters-bar-select" className="flex items-center">
          {select}
        </div>
      ))}
      {search ? (
        <div className="w-full sm:ml-auto sm:w-64">
          <Input
            type="search"
            aria-label={search.placeholder}
            placeholder={search.placeholder}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}
