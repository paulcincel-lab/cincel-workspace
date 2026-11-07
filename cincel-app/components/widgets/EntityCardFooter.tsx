"use client";

import type { CSSProperties } from "react";

import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/shadcn/avatar";
import { StyleView } from "@/components/widgets/StyleView";
import { cn } from "@/lib/utils";

/**
 * Visual-only footer of an `EntityCardGrid` card (redesign FE §3.5, §15.2):
 * a step bar (e.g. the project's tramos: done / current / next) and the team
 * avatars. Esencial and Analítico render nothing: their cards and tables
 * already carry the same facts as text (meta, tramo, avance).
 */
export type EntityCardFooterProps = {
  steps?: { key: string; label: string; state: "done" | "current" | "next"; colorVar: string }[];
  /** Accessible name of the step bar, e.g. "Tramos". */
  stepsLabel?: string;
  people?: { id: string; name: string; initials: string }[];
  /** Accessible name of the avatar group, e.g. "Equipo". */
  peopleLabel?: string;
};

const STATE_TEXT = { done: "terminado", current: "actual", next: "pendiente" } as const;

function StepBar({ steps, label }: { steps: NonNullable<EntityCardFooterProps["steps"]>; label: string }) {
  const description = steps.map((s) => `${s.label} ${STATE_TEXT[s.state]}`).join(", ");
  return (
    <div role="img" aria-label={`${label}: ${description}`} data-slot="entity-steps" className="flex min-w-0 flex-1 gap-1">
      {steps.map((step) => (
        <span
          key={step.key}
          data-step={step.key}
          data-state={step.state}
          className={cn(
            "h-1.5 min-w-3 flex-1 rounded-full",
            step.state === "next" ? "bg-muted" : "bg-(--step-color)",
            step.state === "done" && "opacity-60",
          )}
          style={{ "--step-color": step.colorVar } as CSSProperties}
        />
      ))}
    </div>
  );
}

function Team({ people, label }: { people: NonNullable<EntityCardFooterProps["people"]>; label: string }) {
  return (
    <AvatarGroup role="list" aria-label={label} data-slot="entity-team">
      {people.map((person) => (
        <Avatar key={person.id} size="sm" role="listitem" title={person.name}>
          <AvatarFallback aria-hidden="true">{person.initials}</AvatarFallback>
          <span className="sr-only">{person.name}</span>
        </Avatar>
      ))}
    </AvatarGroup>
  );
}

function Footer({ steps = [], stepsLabel = "Avance", people = [], peopleLabel = "Equipo" }: EntityCardFooterProps) {
  if (steps.length === 0 && people.length === 0) return null;
  return (
    <div className="flex w-full items-center justify-between gap-3">
      {steps.length > 0 ? <StepBar steps={steps} label={stepsLabel} /> : <span />}
      {people.length > 0 ? <Team people={people} label={peopleLabel} /> : null}
    </div>
  );
}

export function EntityCardFooter(props: EntityCardFooterProps) {
  return <StyleView visual={() => <Footer {...props} />} esencial={() => null} analitico={() => null} />;
}
