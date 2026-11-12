"use client";

import { Button } from "@/components/ui/shadcn/button";
import { cn } from "@/lib/utils";

export type CalendarioSegmentedOption<V extends string> = { value: V; label: string };

/**
 * A row of plain shadcn buttons where one is pressed (`aria-pressed`), for the
 * Visual segmented controls and the Esencial pills of /calendario. `pill`
 * rounds the buttons; the label before the group is decorative text.
 */
export function CalendarioSegmented<V extends string>({
  label,
  options,
  value,
  onChange,
  pill = false,
  showLabel = true,
}: {
  label: string;
  options: readonly CalendarioSegmentedOption<V>[];
  value: V;
  onChange(value: V): void;
  pill?: boolean;
  showLabel?: boolean;
}) {
  return (
    <div data-slot="filter-group" data-group={label.toLowerCase()} className="flex flex-wrap items-center gap-2">
      {showLabel ? (
        <span aria-hidden="true" className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
          {label}
        </span>
      ) : null}
      <div role="group" aria-label={label} className="inline-flex flex-wrap items-center gap-1">
        {options.map((option) => {
          const pressed = option.value === value;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={pressed ? "default" : "outline"}
              aria-pressed={pressed}
              className={cn(pill && "rounded-full")}
              onClick={() => {
                if (!pressed) onChange(option.value);
              }}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
