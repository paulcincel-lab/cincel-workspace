"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";

export type Choice = { value: string; label: string };

/** A plain shadcn Select over string choices; values are never empty (see select.tsx). */
export function ChoiceSelect({
  label,
  value,
  choices,
  onChange,
  placeholder = "Elige una opción",
  disabled,
}: {
  /** Accessible name of the trigger. */
  label: string;
  value: string | null;
  choices: Choice[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const items = Object.fromEntries(choices.map((choice) => [choice.value, choice.label]));
  return (
    <Select
      items={items}
      value={value && value in items ? value : null}
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <SelectTrigger className="w-full min-w-48" aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
