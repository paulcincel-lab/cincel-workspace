"use client";

import { useId } from "react";

import { HIDDEN_COMPLETED_COUNT, HIDE_COMPLETED_LABEL, SHOW_HIDDEN_COMPLETED } from "@/components/tareas/task-table-copy";
import { Button } from "@/components/ui/shadcn/button";
import { Switch } from "@/components/ui/shadcn/switch";
import { cn } from "@/lib/utils";

export type HideCompletedSwitchProps = {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  className?: string;
};

/**
 * "Ocultar completadas" (#1039): the switch in the header of every task
 * table. The page decides what it hides and remembers the choice
 * (`useHideCompletedPreference`, `?completadas=0`).
 */
export function HideCompletedSwitch({ checked, onCheckedChange, className }: HideCompletedSwitchProps) {
  const id = useId();
  return (
    <div data-slot="hide-completed" className={cn("flex items-center gap-2", className)}>
      <Switch id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(Boolean(value))} />
      <label htmlFor={id} className="cursor-pointer text-[12.5px] whitespace-nowrap text-foreground">
        {HIDE_COMPLETED_LABEL}
      </label>
    </div>
  );
}

export type HiddenCompletedLineProps = {
  /** Completed tasks the group hides; nothing renders at 0. */
  count: number;
  /** "Mostrar": turns the switch off. */
  onShow(): void;
  /** "row" renders a `<tr>` for the end of a table group; "line" a paragraph under a table. */
  as?: "row" | "line";
  /** "row": the columns the cell spans. */
  colSpan?: number;
};

function LineBody({ count, onShow }: Pick<HiddenCompletedLineProps, "count" | "onShow">) {
  return (
    <span className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground">
      <span>{HIDDEN_COMPLETED_COUNT(count)}</span>
      <span aria-hidden="true">·</span>
      <Button type="button" variant="link" size="sm" className="h-auto p-0 text-[12.5px]" onClick={onShow}>
        {SHOW_HIDDEN_COMPLETED}
      </Button>
    </span>
  );
}

/** "3 completadas ocultas · Mostrar" at the end of a group (#1039). */
export function HiddenCompletedLine({ count, onShow, as = "row", colSpan = 1 }: HiddenCompletedLineProps) {
  if (count <= 0) return null;
  if (as === "line") {
    return (
      <p data-slot="hidden-completed" className="px-1">
        <LineBody count={count} onShow={onShow} />
      </p>
    );
  }
  return (
    <tr data-slot="hidden-completed">
      <td colSpan={colSpan} className="border-b border-border px-3 py-1.5">
        <LineBody count={count} onShow={onShow} />
      </td>
    </tr>
  );
}
