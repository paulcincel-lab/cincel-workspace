"use client";

import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { useId, type ReactNode } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import { cn } from "@/lib/utils";

/**
 * Choice controls of the Ajustes pages (canvas `Ajustes-Apariencia`,
 * `Ajustes-Tema`). Both are a `role="radiogroup"` with one tab stop and
 * arrow-key navigation (Base UI radio group); colors only from tokens.
 */

export type ChoiceCardOption<T extends string> = {
  value: T;
  title: string;
  description?: string;
  /** Mini preview drawn at the top of the card (decorative, `aria-hidden`). */
  preview: ReactNode;
  disabled?: boolean;
  /** Extra decorative content under the title (for example swatch dots). */
  footer?: ReactNode;
};

export type ChoiceCardsProps<T extends string> = {
  /** Accessible name of the radiogroup. */
  label: string;
  value: T;
  options: ChoiceCardOption<T>[];
  onChange(value: T): void;
  /** Every card is locked (`aria-disabled`); the selected one keeps its mark. */
  disabled?: boolean;
  /** Id of a note that describes the group (for example why it is locked). */
  describedBy?: string;
  /** Rendered under the grid, next to the selected card's column (for example a link). */
  afterSelected?: ReactNode;
};

/**
 * Grid of selectable cards (3 columns, one below 640 px). Each card is a
 * radio: 12 px padding, 12 px radius, 1 px `--border` (2 px `--primary` when
 * selected) with a hover lift, the preview, the title and a "Seleccionado"
 * badge on the selected one.
 */
export function ChoiceCards<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  describedBy,
  afterSelected,
}: ChoiceCardsProps<T>) {
  const baseId = useId();
  return (
    <div className="flex flex-col gap-2">
      <RadioGroupPrimitive
        aria-label={label}
        aria-describedby={describedBy}
        value={value}
        disabled={disabled}
        onValueChange={(next) => onChange(next as T)}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        data-slot="choice-cards"
      >
        {options.map((option) => {
          const titleId = `${baseId}-${option.value}-title`;
          const descriptionId = option.description ? `${baseId}-${option.value}-description` : undefined;
          const selected = option.value === value;
          return (
            <div key={option.value} className="flex min-w-0 flex-col gap-2">
              <RadioPrimitive.Root
                value={option.value}
                disabled={disabled || option.disabled}
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                data-slot="choice-card"
                className={cn(
                  "lift flex cursor-pointer flex-col gap-2.5 rounded-xl border border-border bg-card p-3 text-left text-card-foreground outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "data-[checked]:border-2 data-[checked]:border-primary data-[checked]:p-[11px]",
                  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-70",
                )}
              >
                <span aria-hidden="true" className="block">
                  {option.preview}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span id={titleId} className="truncate text-[13.5px] font-semibold">
                    {option.title}
                  </span>
                  {selected ? (
                    <Badge variant="secondary" className="ml-auto">
                      Seleccionado
                    </Badge>
                  ) : null}
                </span>
                {option.description ? (
                  <span id={descriptionId} className="text-[12.5px] text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
                {option.footer ? <span aria-hidden="true">{option.footer}</span> : null}
              </RadioPrimitive.Root>
              {selected && afterSelected ? <div className="flex">{afterSelected}</div> : null}
            </div>
          );
        })}
      </RadioGroupPrimitive>
    </div>
  );
}

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Extra classes for the option's label (for example a sample text size). */
  labelClassName?: string;
};

export type SegmentedChoiceProps<T extends string> = {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange(value: T): void;
  disabled?: boolean;
};

/**
 * Segmented choice: a radiogroup in a 1 px `--border` box (10 px radius,
 * 3 px padding); options 7 × 14 px, 8 px radius, 13 px / 500; the selected
 * one in `--primary` / `--primary-foreground`.
 */
export function SegmentedChoice<T extends string>({ label, value, options, onChange, disabled }: SegmentedChoiceProps<T>) {
  return (
    <RadioGroupPrimitive
      aria-label={label}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as T)}
      data-slot="segmented-choice"
      className="inline-flex flex-wrap items-center gap-0.5 rounded-[10px] border border-border bg-card p-[3px]"
    >
      {options.map((option) => (
        <RadioPrimitive.Root
          key={option.value}
          value={option.value}
          data-slot="segmented-option"
          className={cn(
            "inline-flex cursor-pointer items-center rounded-lg px-3.5 py-[7px] text-[13px] font-medium text-sidebar-foreground outline-none transition-colors",
            "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            "data-[checked]:bg-primary data-[checked]:text-primary-foreground",
            "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60",
          )}
        >
          <span className={option.labelClassName}>{option.label}</span>
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}
