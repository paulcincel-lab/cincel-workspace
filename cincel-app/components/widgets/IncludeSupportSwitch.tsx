"use client";

import { useId } from "react";

import { INCLUDE_SUPPORT_LABEL } from "@/components/tareas/task-table-copy";
import { Switch } from "@/components/ui/shadcn/switch";
import { cn } from "@/lib/utils";

export type IncludeSupportSwitchProps = {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  className?: string;
};

/**
 * "Incluir apoyo" (#1038): beside the Responsable filter, on by default. On,
 * the filter also matches the tasks where the person is apoyo (`?apoyo=0`
 * turns it off).
 */
export function IncludeSupportSwitch({ checked, onCheckedChange, className }: IncludeSupportSwitchProps) {
  const id = useId();
  return (
    <div data-slot="include-support" className={cn("flex items-center gap-2", className)}>
      <Switch id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(Boolean(value))} />
      <label htmlFor={id} className="cursor-pointer text-[12.5px] whitespace-nowrap text-foreground">
        {INCLUDE_SUPPORT_LABEL}
      </label>
    </div>
  );
}
