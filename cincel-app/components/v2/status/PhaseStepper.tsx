import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/** One labelled step of the stepper (e.g. a project's etapa). */
export type PhaseStepperItem = {
  key: string;
  label: string;
  /** e.g. "abr – may"; omitted when the step has no dates. */
  range?: string | null;
  state: "done" | "current" | "next";
};

interface PhaseStepperProps {
  /** Total number of phases in the pipeline, in order. */
  steps: number;
  /** 1-indexed position of the current phase. */
  current: number;
  label?: string;
  className?: string;
  /**
   * Labelled steps (done ✓ / current / next, with date ranges). When given,
   * the stepper renders one labelled step per item instead of the dots, and
   * `label` names the list.
   */
  items?: PhaseStepperItem[];
}

const STATE_TEXT: Record<PhaseStepperItem["state"], string> = {
  done: "completado",
  current: "en curso",
  next: "siguiente",
};

function LabelledSteps({ items, label, className }: { items: PhaseStepperItem[]; label?: string; className?: string }) {
  return (
    <ol aria-label={label} className={cn("flex w-full items-start", className)}>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <li
            key={item.key}
            aria-current={item.state === "current" ? "step" : undefined}
            className={cn("flex min-w-0 flex-col gap-1.5", last ? "flex-none" : "flex-1")}
          >
            <span className="flex items-center">
              <span
                className={cn(
                  "inline-flex size-6 flex-none items-center justify-center rounded-full border-2 text-xs font-medium",
                  item.state === "done" && "border-primary bg-primary text-primary-foreground",
                  item.state === "current" && "border-primary bg-card text-foreground",
                  item.state === "next" && "border-border bg-card text-muted-foreground"
                )}
              >
                {item.state === "done" ? <Check className="size-3" aria-hidden="true" /> : index + 1}
              </span>
              {last ? null : (
                <span
                  aria-hidden="true"
                  className={cn("mx-1 h-0.5 flex-1 rounded-full", item.state === "done" ? "bg-primary" : "bg-muted")}
                />
              )}
            </span>
            <span
              className={cn(
                "truncate text-xs",
                item.state === "current" ? "font-semibold text-foreground" : "text-foreground",
                item.state === "next" && "text-muted-foreground"
              )}
            >
              {item.label}
              <span className="sr-only">, {STATE_TEXT[item.state]}</span>
            </span>
            {item.range ? <span className="truncate font-mono text-[11px] text-muted-foreground">{item.range}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A dot-sequence progress indicator for a task's position in a sequential
 * pipeline (e.g. Anteproyecto → Proyecto Arquitectónico → Ejecutivo).
 * Replaces a plain text Badge for phase, which doesn't convey order.
 * With `items` it renders labelled steps instead (a project's etapas).
 */
export function PhaseStepper({ steps, current, label, className, items }: PhaseStepperProps) {
  if (items) return <LabelledSteps items={items} label={label} className={className} />;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="inline-flex items-center gap-[3px]">
        {Array.from({ length: steps }, (_, i) => {
          const index = i + 1;
          const done = index < current;
          const isCurrent = index === current;
          return (
            <span
              key={index}
              className={cn(
                "h-1 w-3.5 rounded-full bg-muted",
                done && "bg-foreground",
                isCurrent && "bg-muted-foreground"
              )}
            />
          );
        })}
      </span>
      {label ? (
        <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      ) : null}
    </span>
  );
}
