"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type WizardStepperStep<Id extends string = string> = { id: Id; label: string };

export type WizardStepState = "done" | "current" | "upcoming";

/**
 * Token pairs the stepper paints text with, in `lib/ui/contrast.ts` names (the wizards a11y test checks them with
 * `checkContrast` for every preset). Done marker: primary; current marker: secondary; upcoming marker and label:
 * muted-foreground on card; labels: foreground on background.
 */
export const WIZARD_STEPPER_CONTRAST_PAIRS = [
  "primary-foreground/primary",
  "secondary-foreground/secondary",
  "muted-foreground/card",
  "muted-foreground/background",
  "foreground/background",
] as const;

export function wizardStepState(index: number, currentIndex: number): WizardStepState {
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "current";
  return "upcoming";
}

export type WizardStepperProps<Id extends string> = {
  steps: readonly WizardStepperStep<Id>[];
  current: Id;
  /** A done step the person may go back to renders as a button ("Volver a …"). */
  canJump?: (step: Id) => boolean;
  onJump?: (step: Id) => void;
  className?: string;
};

const MARKER_BY_STATE: Record<WizardStepState, string> = {
  done: "bg-primary text-primary-foreground",
  current: "bg-secondary text-secondary-foreground",
  upcoming: "border border-input bg-card text-muted-foreground",
};

const BAR_BY_STATE: Record<WizardStepState, string> = {
  done: "bg-primary",
  current: "bg-primary",
  upcoming: "bg-input",
};

const LABEL_BY_STATE: Record<WizardStepState, string> = {
  done: "text-foreground",
  current: "font-semibold text-foreground",
  upcoming: "text-muted-foreground",
};

function StepContent({ state, number, label }: { state: WizardStepState; number: number; label: string }) {
  return (
    <>
      <span aria-hidden="true" className={cn("h-1 w-full rounded-full", BAR_BY_STATE[state])} />
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            MARKER_BY_STATE[state],
          )}
        >
          {state === "done" ? <Check className="size-3.5" /> : number}
        </span>
        {state === "done" ? <span className="sr-only">Completado: </span> : null}
        {/* Under 640 px only the current step keeps its label visible, so seven steps fit at 390 px. */}
        <span className={cn("min-w-0 truncate", LABEL_BY_STATE[state], state === "current" ? null : "max-sm:sr-only")}>
          {label}
        </span>
      </span>
    </>
  );
}

/**
 * Stepper of the first-login wizards (Google primeros pasos and Importar de monday, redesign FE §3.10): a bar and
 * a numbered marker per step in three states (done ✓, current, upcoming); the current step carries
 * `aria-current="step"`. Colors come only from theme tokens; it ignores the presentation style.
 */
export function WizardStepper<Id extends string>({ steps, current, canJump, onJump, className }: WizardStepperProps<Id>) {
  const currentIndex = steps.findIndex((step) => step.id === current);
  return (
    <ol aria-label="Pasos" className={cn("flex w-full gap-2", className)}>
      {steps.map((step, index) => {
        const state = wizardStepState(index, currentIndex);
        const jumpable = Boolean(onJump && canJump?.(step.id));
        const isCurrent = state === "current";
        return (
          <li
            key={step.id}
            aria-current={isCurrent ? "step" : undefined}
            data-state={state}
            className={cn("min-w-0", isCurrent ? "flex-[2_1_0%] sm:flex-1" : "flex-1")}
          >
            {jumpable ? (
              <button
                type="button"
                aria-label={`Volver a ${step.label}`}
                onClick={() => onJump?.(step.id)}
                className="flex min-h-11 w-full min-w-0 flex-col gap-2 rounded-md text-left outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <StepContent state={state} number={index + 1} label={step.label} />
              </button>
            ) : (
              <div className="flex min-w-0 flex-col gap-2">
                <StepContent state={state} number={index + 1} label={step.label} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
