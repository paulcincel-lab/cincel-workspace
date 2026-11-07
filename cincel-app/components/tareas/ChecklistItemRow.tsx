"use client";

import { useId } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";

type ChecklistItemRowProps = {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

/**
 * One checklist point: checkbox + text, struck through when done. Shared by
 * the task checklist (`TaskDrawer`) and Mi espacio's `ChecklistCard`.
 */
export function ChecklistItemRow({ label, checked, onToggle, disabled }: ChecklistItemRowProps) {
  const id = useId();
  return (
    <div className="flex flex-1 items-center gap-3">
      <Checkbox id={id} checked={checked} disabled={disabled} aria-label={label} onCheckedChange={() => onToggle()} />
      {/* A sibling label (not a wrapper): a wrapping label re-clicks the control and toggles twice. */}
      <label htmlFor={id} className={`flex-1 text-sm ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}>
        {label}
      </label>
    </div>
  );
}

type ChecklistAddItemInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  /** Inline error under the input (wired with `aria-describedby`). */
  error?: string | null;
  /** Id prefix for the error element; required when `error` can show. */
  id?: string;
};

/** "Nuevo punto..." input + "Agregar"; Enter submits. */
export function ChecklistAddItemInput({ value, onValueChange, onSubmit, disabled, error, id }: ChecklistAddItemInputProps) {
  const errorId = id ? `${id}-error` : undefined;
  return (
    <div className="space-y-1 pt-2">
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="Nuevo punto..."
          aria-label="Nuevo punto"
          aria-invalid={error ? true : undefined}
          aria-describedby={error && errorId ? errorId : undefined}
          className="h-8 text-sm"
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <Button variant="outline" size="sm" className="h-8" disabled={disabled} onClick={onSubmit}>
          Agregar
        </Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
