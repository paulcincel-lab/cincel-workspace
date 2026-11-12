"use client";

import { useState, type ReactNode } from "react";

import { Input } from "@/components/ui/shadcn/input";
import type { TaskDetail } from "@/lib/types/core";

import { HOURS_FALLBACK, HOURS_MAX, HOURS_MIN, HOURS_STEP, formatHours, hoursFieldText, parseHoursText } from "./task-hours";
import { HOURS_DEFAULT_HINT, HOURS_RANGE_ERROR } from "./task-table-copy";

export type TaskHoursFieldProps = {
  id: string;
  task: Pick<TaskDetail, "estimatedHours">;
  disabled: boolean;
  /** Saves the hours (null clears). */
  onSave(hours: number | null): void;
};

/**
 * "Horas estimadas" of the task sheet (#1084): a number field (0.5 step) that
 * saves on blur or Enter; empty clears. Without hours the placeholder shows
 * the 1 h the calendar counts and a hint says so.
 */
export function TaskHoursField({ id, task, disabled, onSave }: TaskHoursFieldProps): ReactNode {
  const stored = task.estimatedHours ?? null;
  const [text, setText] = useState(hoursFieldText(stored));
  const [error, setError] = useState(false);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  // Follows the task after a save or a change from elsewhere.
  const [seenStored, setSeenStored] = useState(stored);
  if (seenStored !== stored) {
    setSeenStored(stored);
    setText(hoursFieldText(stored));
    setError(false);
  }

  const commit = () => {
    const parsed = parseHoursText(text);
    if (!parsed.ok) {
      setError(true);
      return;
    }
    setError(false);
    if (parsed.hours !== stored) onSave(parsed.hours);
  };

  return (
    <div className="space-y-1">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={HOURS_MIN}
        max={HOURS_MAX}
        step={HOURS_STEP}
        value={text}
        disabled={disabled}
        placeholder={formatHours(HOURS_FALLBACK)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : stored === null ? hintId : undefined}
        onChange={(event) => {
          setText(event.target.value);
          if (error) setError(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          // Enter saves the field, not the sheet's form.
          event.preventDefault();
          commit();
        }}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {HOURS_RANGE_ERROR}
        </p>
      ) : stored === null ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {HOURS_DEFAULT_HINT}
        </p>
      ) : null}
    </div>
  );
}
