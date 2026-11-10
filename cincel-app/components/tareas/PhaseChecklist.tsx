"use client";

import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Label } from "@/components/ui/shadcn/label";

export type PhaseChecklistItem = {
  id: string;
  /** "Anteproyecto · 4 tareas": the label and the checkbox's accessible name. */
  label: string;
  /** Lines under the label (sample tasks, candidates). */
  details?: ReactNode;
  /** Rendered under the row (the sheet's manager select). */
  extra?: ReactNode;
};

export interface PhaseChecklistProps {
  /** Prefix of each checkbox id (`${idPrefix}${phase.id}`). */
  idPrefix: string;
  phases: PhaseChecklistItem[];
  checkedIds: ReadonlySet<string>;
  onToggle: (phaseId: string, checked: boolean) => void;
}

/** The fase checkboxes of the Iniciar tramo sheet, also used by "Tramo inicial" in Nuevo proyecto (#1034). */
export function PhaseChecklist({ idPrefix, phases, checkedIds, onToggle }: PhaseChecklistProps) {
  return (
    <ul className="space-y-3">
      {phases.map((entry) => {
        const checkboxId = `${idPrefix}${entry.id}`;
        return (
          <li key={entry.id}>
            <div className="flex items-start gap-2">
              <Checkbox
                id={checkboxId}
                aria-label={entry.label}
                checked={checkedIds.has(entry.id)}
                onCheckedChange={(next) => onToggle(entry.id, next === true)}
                className="mt-0.5"
              />
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor={checkboxId}>{entry.label}</Label>
                {entry.details}
              </div>
            </div>
            {entry.extra}
          </li>
        );
      })}
    </ul>
  );
}
