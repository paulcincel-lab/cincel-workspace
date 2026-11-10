"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/shadcn/button";
import { CLEAR_SELECTION_LABEL, SELECTED_COUNT } from "@/components/widgets/table-rows";
import { cn } from "@/lib/utils";

/**
 * The bar at the bottom of a table while rows are selected (#1040): "n
 * seleccionadas", the actions, and "Quitar selección". Renders nothing when
 * `count` is 0. Field pickers (Estatus, Responsable, …) go in `children`.
 * Same parts as `components/v2/table/BulkActionBar` (the shadcn Button on a
 * `foreground` bar), sticky at the bottom of the viewport; Esc inside it
 * clears the selection.
 */
export type BulkBarAction = {
  id: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect(): void;
};

export type BulkActionBarProps = {
  count: number;
  actions: BulkBarAction[];
  /** "Quitar selección" (and Esc). */
  onClear(): void;
  /** Extra controls before the actions (e.g. a picker popover per field). */
  children?: ReactNode;
};

/** Classes of a control on the bar (pickers in `children` use them too). */
export const BULK_BAR_BUTTON_CLASS =
  "h-7 border border-background/30 text-background hover:bg-background/10 hover:text-background aria-expanded:bg-background/10";

export function BulkActionBar({ count, actions, onClear, children }: BulkActionBarProps): ReactNode {
  if (count === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label={SELECTED_COUNT(count)}
      data-slot="bulk-action-bar"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        onClear();
      }}
      className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-xs text-background shadow-lg"
    >
      <span aria-live="polite" className="font-semibold whitespace-nowrap">
        {SELECTED_COUNT(count)}
      </span>
      <span aria-hidden="true" className="h-4 w-px bg-background/30" />
      {children}
      {actions.map((action) => (
        <Button
          key={action.id}
          type="button"
          variant="ghost"
          size="sm"
          disabled={action.disabled}
          onClick={action.onSelect}
          className={cn(BULK_BAR_BUTTON_CLASS, action.destructive && "border-destructive/70 hover:bg-destructive")}
        >
          {action.label}
        </Button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="h-7 text-background hover:bg-background/10 hover:text-background"
      >
        <XIcon aria-hidden="true" />
        {CLEAR_SELECTION_LABEL}
      </Button>
    </div>
  );
}
