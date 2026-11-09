"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { parseQuickAdd } from "@/lib/quick-add/parse";
import type { TaskPriority } from "@/lib/types/core";

/**
 * Smart quick-add (ADR 0005): write on the last line of a list, column or
 * card to create a task. Minimal markup for now: a labelled input whose Enter
 * calls `onCreate` with the `parseQuickAdd` output. Full behavior in #984.
 */
export type QuickAddContext = {
  label: string;
  projectId: string | null;
  tramoId?: string | null;
  status?: string;
  assigneeId?: string | null;
  placeholder?: string;
};
export type QuickAddDraft = {
  title: string;
  projectId: string | null;
  tramoId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status?: string;
};
export type QuickAddCreated = { id: string; title: string };
export type QuickAddRowProps = {
  context: QuickAddContext;
  onCreate(draft: QuickAddDraft): Promise<QuickAddCreated>;
  variant: "row" | "card" | "column";
  colSpan?: number;
  disabled?: boolean;
};

export function QuickAddRow({ context, onCreate, disabled = false }: QuickAddRowProps): ReactNode {
  const id = useId();
  const [text, setText] = useState("");

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || disabled) return;
    event.preventDefault();
    const parsed = parseQuickAdd(text, {
      today: new Date().toISOString().slice(0, 10),
      people: [],
      tramos: [],
      meId: null,
    });
    if (!parsed.title) return;
    const draft: QuickAddDraft = {
      title: parsed.title,
      projectId: context.projectId,
      tramoId: parsed.tramoId ?? context.tramoId ?? null,
      assigneeId: parsed.assigneeId ?? context.assigneeId ?? null,
      dueDate: parsed.dueDate ?? null,
      priority: parsed.priority ?? "media",
      ...(context.status !== undefined ? { status: context.status } : {}),
    };
    setText("");
    onCreate(draft).catch(() => setText(text));
  }

  return (
    <div>
      <label htmlFor={id}>{context.label}</label>
      <input
        id={id}
        type="text"
        value={text}
        placeholder={context.placeholder}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
