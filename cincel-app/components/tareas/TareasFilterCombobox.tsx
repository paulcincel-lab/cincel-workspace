"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { buttonVariants } from "@/components/ui/shadcn/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/shadcn/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";

export type TareasFilterOption = { value: string; label: string };

export type TareasFilterComboboxProps = {
  /** Trigger prefix, e.g. "Responsable" → "Responsable: Yo". */
  label: string;
  /** Selected option value. */
  value: string;
  options: TareasFilterOption[];
  /** Trigger text when the selected value has no prefix (e.g. "Proyecto" for every project). */
  placeholderValue?: string;
  searchPlaceholder: string;
  onChange(value: string): void;
};

/**
 * One filter combobox of the Tareas filters bar (FE §3.4): a shadcn
 * `Popover` + `Command` with a search box. Used for "Responsable" and
 * "Proyecto".
 */
export function TareasFilterCombobox({
  label,
  value,
  options,
  placeholderValue,
  searchPlaceholder,
  onChange,
}: TareasFilterComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;
  const text = placeholderValue !== undefined && value === placeholderValue ? label : `${label}: ${selected?.label ?? ""}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={buttonVariants({ variant: "outline", size: "lg" })} aria-label={text}>
        <span>{text}</span>
        <ChevronDown aria-hidden="true" data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  data-checked={option.value === value}
                  onSelect={() => {
                    setOpen(false);
                    if (option.value !== value) onChange(option.value);
                  }}
                >
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
